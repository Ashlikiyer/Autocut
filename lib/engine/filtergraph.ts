import type { EDL, SfxName, VideoInfo } from "@/types";
import type { Composition } from "./compose";

export interface RenderQuality {
  /** Shorter side of the output, in pixels (never upscaled), when not cropping. */
  maxShortSide: number;
  /** Output size when cropping to 9:16. */
  vertical: [number, number];
  /** Output frame rate cap. */
  maxFps: number;
  /** swscale algorithm. Scaling dominates render time in wasm. */
  scaleFlags: "fast_bilinear" | "bilinear" | "bicubic";
  /** Normalize loudness to about -14 LUFS (slow; final export only). */
  loudnorm: boolean;
}

export const PREVIEW_QUALITY: RenderQuality = {
  maxShortSide: 480,
  vertical: [360, 640],
  maxFps: 30,
  // ~35% faster than bicubic; fine for a quick low-res preview.
  scaleFlags: "fast_bilinear",
  loudnorm: false,
};
export const FINAL_QUALITY: RenderQuality = {
  maxShortSide: 1080,
  vertical: [1080, 1920],
  maxFps: 30,
  scaleFlags: "bilinear",
  loudnorm: true,
};

const fmt = (n: number) => n.toFixed(3);
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * Expression that is true while `t` is inside a kept segment. Segments are
 * half-open so a frame on a boundary is never selected twice.
 */
export function selectExpression(edl: EDL): string {
  return edl.segments
    .map((s) => `gte(t,${fmt(s.start)})*lt(t,${fmt(s.end)})`)
    .join("+");
}

export function outputFps(info: Pick<VideoInfo, "fps">, q: RenderQuality) {
  const fps = info.fps > 0 ? info.fps : q.maxFps;
  return Math.min(Math.round(fps), q.maxFps);
}

/** Display size after rotation metadata is applied. */
export function displaySize(info: VideoInfo): [number, number] {
  const sideways = Math.abs(info.rotation ?? 0) % 180 === 90;
  return sideways ? [info.height, info.width] : [info.width, info.height];
}

export function outputSize(info: VideoInfo, q: RenderQuality, vertical: boolean): [number, number] {
  if (vertical) return q.vertical;
  const [w, h] = displaySize(info);
  const scale = Math.min(1, q.maxShortSide / Math.min(w, h));
  return [even(w * scale), even(h * scale)];
}

/** Extra zoom of the "close" framing in jump-cut zoom. */
const CUT_ZOOM = 0.1;

/**
 * Output-time ranges shown in the close framing: every other kept segment, so
 * each jump cut switches between wide and close (the cut stops looking like a skip).
 */
export function cutZoomRanges(comp: Composition): { start: number; end: number }[] {
  if (!comp.cutZoom) return [];
  const out: { start: number; end: number }[] = [];
  let t = 0;
  comp.edl.segments.forEach((s, i) => {
    const len = s.end - s.start;
    if (i % 2 === 1 && len >= 0.6) out.push({ start: t, end: t + len });
    t += len;
  });
  return out;
}

/**
 * Default top edge of each kind of card (fraction of the height); -1 means
 * centred (focus titles). Shared with the editor preview.
 */
export const CARD_TOP: Record<Composition["cards"][number]["kind"], number> = {
  pill: 0.065,
  step: 0.11,
  hook: 0.085,
  pop: 0.26,
  text: 0.45,
  focus: -1,
};

/** Zoom factor expression over output time T (a punch-in with quick ease in/out). */
function zoomExpression(comp: Composition, T: string): string {
  const cut = cutZoomRanges(comp).map(
    (r) => `gte(${T},${fmt(r.start)})*lt(${T},${fmt(r.end)})*${fmt(CUT_ZOOM)}`,
  );
  if (!comp.zooms.length && !cut.length) return "1";
  const terms = comp.zooms.map((z) => {
    const a = fmt(z.start);
    const b = fmt(z.end);
    // Punch: snap in over 0.12 s, hold, ease out over 0.2 s.
    // Slow: creep in across the whole line, then release over 0.3 s.
    const ramp =
      z.style === "slow"
        ? `min((${T}-${a})/${fmt(Math.max(0.5, z.end - z.start))},(${b}-${T})/0.3)`
        : `min((${T}-${a})/0.12,(${b}-${T})/0.2)`;
    return `between(${T},${a},${b})*${fmt(z.scale - 1)}*min(1,${ramp})`;
  });
  return `1+${[...cut, ...terms].join("+")}`;
}

function shakeExpression(comp: Composition, T: string, amp: number, freq: number): string {
  const shakes = comp.zooms.filter((z) => z.shake);
  if (!shakes.length) return "0";
  return shakes
    .map((z) => `between(${T},${fmt(z.start)},${fmt(z.start + 0.45)})*${amp}*sin(${T}*${freq})`)
    .join("+");
}

export interface RenderAssets {
  /** Path of the ASS file in ffmpeg's FS, if there's any text to draw. */
  assPath?: string;
  fontsDir?: string;
  /** One PNG per composition.emojis entry, same order. */
  emojiPaths: string[];
  /** One PNG per composition.cards entry, same order, drawn 1080 px wide. */
  cardPaths?: string[];
  /**
   * HyperFrames-rendered cards (transparent WebM), used instead of cardPaths:
   * one segment per composition.cards entry, same order.
   */
  cardOverlay?: { path: string; segments: { offset: number; duration: number }[] };
  sfxPaths: Partial<Record<SfxName, string>>;
  musicPath?: string;
}

export interface RenderGraph {
  /** Input arguments after the main video input. */
  inputArgs: string[];
  graph: string;
}

/**
 * Builds the filter graph for a composition.
 *
 * Cutting uses select/aselect in a single pass rather than trim + concat per
 * segment: trim + concat buffers decoded frames for every waiting segment,
 * which runs ffmpeg.wasm out of memory on longer videos. Video is first
 * converted to a constant frame rate so frame-count timestamps stay in sync.
 *
 * Outputs are labelled [v] and [a].
 */
export function buildRenderGraph(
  comp: Composition,
  info: VideoInfo,
  q: RenderQuality,
  assets: RenderAssets,
): RenderGraph {
  const { edl } = comp;
  if (edl.segments.length === 0) throw new Error("EDL has no segments");
  const expr = selectExpression(edl);
  const fps = outputFps(info, q);
  const [W, H] = outputSize(info, q, comp.vertical);
  const D = edl.outputDuration;

  const inputArgs: string[] = [];
  let nextInput = 1;
  const addInput = (args: string[]) => {
    inputArgs.push(...args);
    return nextInput++;
  };

  // ---- video ----
  const v: string[] = [`fps=${fps}`, `select='${expr}'`, "setpts=N/FRAME_RATE/TB"];
  if (comp.vertical) v.push("crop=w='min(iw,ih*9/16)':h='min(ih,iw*16/9)'");
  if (comp.zooms.length || cutZoomRanges(comp).length) {
    // After select + setpts frames are consecutive at a constant rate, so the
    // output time is the input frame number over fps.
    const T = `(in/${fps})`;
    const amp = Math.max(2, Math.round(Math.min(W, H) * 0.012));
    v.push(
      `zoompan=z='${zoomExpression(comp, T)}'` +
        `:x='iw/2-(iw/zoom/2)+${shakeExpression(comp, T, amp, 70)}'` +
        `:y='ih/2-(ih/zoom/2)+${shakeExpression(comp, T, amp, 53)}'` +
        `:d=1:s=${W}x${H}:fps=${fps}`,
    );
  } else {
    v.push(`scale=${W}:${H}:flags=${q.scaleFlags}`);
  }
  v.push("setsar=1");
  // Focus moments: blur and dim the video behind a big centred title.
  const focus = comp.cards.filter((c) => c.kind === "focus");
  if (focus.length) {
    const win = focus.map((c) => `between(t,${fmt(c.start)},${fmt(c.end)})`).join("+");
    v.push(`gblur=sigma=${Math.max(4, Math.round(Math.min(W, H) * 0.025))}:enable='${win}'`);
    v.push(`eq=brightness=-0.12:saturation=0.75:enable='${win}'`);
  }
  if (comp.colorBoost) v.push("eq=saturation=1.3:contrast=1.06");
  if (comp.vignette) v.push("vignette=angle=PI/6");
  if (comp.flashes.length) {
    const win = comp.flashes.map((c) => `between(t,${fmt(c)},${fmt(c + 0.2)})`).join("+");
    const br = comp.flashes
      .map((c) => `between(t,${fmt(c)},${fmt(c + 0.2)})*0.55*(1-(t-${fmt(c)})/0.2)`)
      .join("+");
    v.push(`eq=brightness='${br}':eval=frame:enable='${win}'`);
  }
  if (assets.assPath) {
    v.push(`subtitles=filename=${assets.assPath}${assets.fontsDir ? `:fontsdir=${assets.fontsDir}` : ""}`);
  }

  const parts: string[] = [];
  let vLabel = "vbase";
  parts.push(`[0:v]${v.join(",")}[${vLabel}]`);

  // Emoji overlays: a single-frame PNG input held on screen (eof_action=repeat).
  // The editor can set each sticker's centre (x, y) and size.
  comp.emojis.forEach((e, i) => {
    const path = assets.emojiPaths[i];
    if (!path) return;
    const size = even(Math.min(W, H) * (e.size ?? 0.2));
    const idx = addInput(["-i", path]);
    const a = fmt(e.start);
    parts.push(`[${idx}:v]format=rgba,scale=${size}:${size}[em${i}]`);
    const next = `vem${i}`;
    parts.push(
      `[${vLabel}][em${i}]overlay=x=W*${fmt(e.x ?? 0.5)}-w/2:y='H*${fmt(e.y ?? 0.32)}-h/2+H*0.05*max(0,1-(t-${a})/0.15)'` +
        `:enable='between(t,${a},${fmt(e.end)})':eof_action=repeat[${next}]`,
    );
    vLabel = next;
  });

  // HyperFrames cards: each card is its own seeked slice of the overlay WebM
  // (splitting one decoded stream would buffer full frames for every card and
  // run out of memory), scaled to the output and delayed to its start.
  const overlay = assets.cardOverlay;
  const useOverlay = Boolean(overlay && overlay.segments.length === comp.cards.length);
  if (overlay && useOverlay) {
    comp.cards.forEach((c, i) => {
      const seg = overlay.segments[i];
      const dur = Math.min(seg.duration, Math.max(0.2, c.end - c.start));
      // libvpx-vp9 is the decoder that keeps the alpha channel.
      const idx = addInput(["-ss", fmt(seg.offset), "-t", fmt(dur), "-c:v", "libvpx-vp9", "-i", overlay.path]);
      const a = fmt(c.start);
      parts.push(`[${idx}:v]format=rgba,scale=${W}:${H},setpts=PTS-STARTPTS+${a}/TB[hf${i}]`);
      const next = `vhf${i}`;
      parts.push(
        `[${vLabel}][hf${i}]overlay=0:0:enable='between(t,${a},${fmt(c.start + dur)})':eof_action=pass[${next}]`,
      );
      vLabel = next;
    });
  }

  // Cards (pills, step cards, focus titles, hook): a still PNG looped for the
  // card's time, faded and slid in, delayed to its start with setpts.
  const scale = W / 1080;
  comp.cards.forEach((c, i) => {
    if (useOverlay) return;
    const path = assets.cardPaths?.[i];
    if (!path) return;
    const dur = Math.max(0.4, c.end - c.start);
    const idx = addInput(["-loop", "1", "-framerate", String(fps), "-t", fmt(dur), "-i", path]);
    const a = fmt(c.start);
    // Entrance (matches lib/editor/preview.ts `entranceAt`).
    const anim = c.animation ?? "slide";
    const fades =
      anim === "none"
        ? ""
        : `fade=t=in:st=0:d=${anim === "pop" || anim === "bounce" ? 0.1 : 0.18}:alpha=1,` +
          `fade=t=out:st=${fmt(dur - 0.2)}:d=0.2:alpha=1,`;
    parts.push(
      `[${idx}:v]format=rgba,scale=w='trunc(iw*${fmt(scale)}/2)*2':h=-2,${fades}` +
        `setpts=PTS-STARTPTS+${a}/TB[cd${i}]`,
    );
    // Default spots per kind (top edge as a fraction of the height); the
    // editor can move a card by setting x (centre) and y (top edge).
    const top = c.y ?? CARD_TOP[c.kind];
    const l = `(t-${a})`;
    const motion =
      anim === "slide"
        ? // Pills drop down, everything else rises up, over 0.2 s.
          `${c.kind === "pill" ? -1 : 1}*H*0.02*max(0,1-${l}/0.2)`
        : anim === "pop"
          ? `H*0.03*exp(-${l}*14)*cos(${l}*22)`
          : anim === "bounce"
            ? `-H*0.06*exp(-${l}*8)*abs(cos(${l}*14))`
            : "0";
    const y = top < 0 ? `(H-h)/2-H*0.04+${motion}` : `H*${fmt(top)}+${motion}`;
    const x = c.x === undefined ? "(W-w)/2" : `W*${fmt(c.x)}-w/2`;
    const next = `vcd${i}`;
    parts.push(
      `[${vLabel}][cd${i}]overlay=x=${x}:y='${y}':enable='between(t,${a},${fmt(c.end)})':eof_action=pass[${next}]`,
    );
    vLabel = next;
  });

  const tail: string[] = [];
  if (comp.progressBar) {
    const bh = Math.max(4, Math.round(H * 0.007));
    tail.push(
      `drawbox=x=0:y=ih-${bh}:w='iw*t/${fmt(Math.max(D, 0.1))}':h=${bh}:color=0x${comp.accent.replace("#", "")}@0.9:t=fill`,
    );
  }
  tail.push("format=yuv420p");
  parts.push(`[${vLabel}]${tail.join(",")}[v]`);

  // ---- audio ----
  const toStereo = "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo";
  const mixInputs: string[] = [];
  // Music plays over its span (the whole edit unless the editor set one).
  const m = comp.music && assets.musicPath ? comp.music : null;
  const mStart = m ? Math.min(D, Math.max(0, m.start ?? 0)) : 0;
  const mLen = m ? Math.min(D, m.end ?? D) - mStart : 0;
  const hasMusic = Boolean(m) && mLen >= 0.1;
  const duck = hasMusic && (m?.ducking ?? true);

  parts.push(
    `[0:a]aselect='${expr}',asetpts=N/SR/TB,${toStereo}${duck ? ",asplit=2[speech][side]" : "[speech]"}`,
  );
  mixInputs.push("[speech]");

  if (hasMusic && m) {
    const idx = addInput(["-stream_loop", "-1", "-i", assets.musicPath!]);
    const fadeIn = Math.min(mLen, Math.max(0, m.fadeIn ?? 0.5));
    const fadeOut = Math.min(mLen, Math.max(0, m.fadeOut ?? 1.5));
    const chain = [toStereo, `atrim=0:${fmt(mLen)}`, "asetpts=N/SR/TB"];
    if (fadeIn > 0) chain.push(`afade=t=in:d=${fmt(fadeIn)}`);
    if (fadeOut > 0) chain.push(`afade=t=out:st=${fmt(mLen - fadeOut)}:d=${fmt(fadeOut)}`);
    chain.push(`volume=${m.volume.toFixed(2)}`);
    if (mStart > 0) chain.push(`adelay=${Math.round(mStart * 1000)}:all=1`);
    parts.push(`[${idx}:a]${chain.join(",")}[music]`);
    if (duck) {
      // Duck the music whenever someone is speaking.
      parts.push(`[music][side]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=350[ducked]`);
      mixInputs.push("[ducked]");
    } else {
      mixInputs.push("[music]");
    }
  }

  // Sound effects: one input per distinct sound and level, split per cue,
  // delayed into place.
  const bySound = new Map<string, { sound: SfxName; volume: number; times: number[] }>();
  for (const s of comp.sfx) {
    if (!assets.sfxPaths[s.sound]) continue;
    const volume = comp.sfxVolume * (s.volume ?? 1);
    const key = `${s.sound}@${volume.toFixed(2)}`;
    const group = bySound.get(key) ?? { sound: s.sound, volume, times: [] };
    group.times.push(s.at);
    bySound.set(key, group);
  }
  let cue = 0;
  for (const { sound, volume, times } of bySound.values()) {
    const idx = addInput(["-i", assets.sfxPaths[sound]!]);
    const labels = times.map((_, i) => `[s${cue + i}]`);
    parts.push(
      `[${idx}:a]${toStereo},volume=${volume.toFixed(2)},asplit=${times.length}${labels.join("")}`,
    );
    times.forEach((at, i) => {
      const ms = Math.max(0, Math.round(at * 1000));
      parts.push(`${labels[i]}adelay=${ms}:all=1[x${cue + i}]`);
      mixInputs.push(`[x${cue + i}]`);
    });
    cue += times.length;
  }

  // The output format is pinned: when a late input (a sound effect) makes
  // ffmpeg reinitialize the graph, an unpinned layout can't be negotiated
  // with the already-open encoder.
  const master = `${q.loudnorm ? "loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000" : "alimiter=limit=0.95"},aformat=sample_fmts=fltp:channel_layouts=stereo`;
  if (mixInputs.length === 1) {
    parts.push(`[speech]${master}[a]`);
  } else {
    parts.push(
      `${mixInputs.join("")}amix=inputs=${mixInputs.length}:normalize=0:duration=first:dropout_transition=0,${master}[a]`,
    );
  }

  return { inputArgs, graph: parts.join(";\n") };
}
