import type {
  EDL,
  EditSettings,
  EffectsPlan,
  MusicMood,
  SfxName,
  TimeRange,
  VideoInfo,
  Word,
  ZoomStyle,
} from "@/types";
import {
  INTENSITY_SCALE,
  MAX_EFFECTS_SECONDS,
  MIN_TRANSITIONS_PER_MINUTE,
  PRESETS,
  type CaptionStyle,
} from "@/lib/presets";
import { effectCaps } from "@/lib/plan";
import type { AssText } from "./ass";
import type { CardKind, TextStyle } from "@/types";
import { findCuts } from "./cuts";
import { buildEDL, cutPoints, retimeWords, toOutputRange, toOutputTime } from "./edl";

export interface Zoom extends TimeRange {
  scale: number;
  shake: boolean;
  /** "punch": quick in/out on a moment; "slow": gradual push-in over a line. */
  style: ZoomStyle;
}

export interface EmojiPop extends TimeRange {
  emoji: string;
  /** Editor item id (lets the preview map an overlay back to its item). */
  id?: string;
  /** Set by the editor: centre (fractions of the frame) and size (fraction of the shorter side). */
  x?: number;
  y?: number;
  size?: number;
}

export interface SfxCue {
  sound: SfxName;
  at: number;
  /** Set by the editor: this cue's level (multiplies sfxVolume). */
  volume?: number;
}

/** Background music: the whole edit by default; the editor can set a span and fades. */
export type CompMusic = ({ source: "bundled"; mood: MusicMood; file?: string } | { source: "custom" }) & {
  volume: number;
  start?: number;
  end?: number;
  fadeIn?: number;
  fadeOut?: number;
  /** Lower the music under speech (default true). */
  ducking?: boolean;
};

/** A graphic card drawn as an image and laid over the video (output timeline). */
export interface CompCard extends TimeRange {
  /** Editor item id (lets the preview map an overlay back to its item). */
  id?: string;
  kind: CardKind | "hook" | "pop" | "text";
  text: string;
  label?: string;
  /** Text pops: how the words animate in. */
  style?: TextStyle;
  /** Hook: words to draw in the accent colour; sticker under the title. */
  accent?: string;
  sticker?: string;
  /** Set by the editor: top-centre position (fractions of the frame). */
  x?: number;
  y?: number;
  /** Plain text ("text" cards from the editor): look and entrance. */
  font?: string;
  size?: number;
  color?: string;
  animation?: "none" | "fade" | "pop" | "bounce" | "slide";
}

/** Everything the renderer needs, on the output (cut) timeline. */
export interface Composition {
  edl: EDL;
  vertical: boolean;
  words: Word[];
  caption: CaptionStyle | null;
  hook: string | null;
  hookFont: string;
  zooms: Zoom[];
  flashes: number[];
  emojis: EmojiPop[];
  texts: AssText[];
  sfx: SfxCue[];
  sfxVolume: number;
  music: CompMusic | null;
  /** Set by the editor: caption groups exactly as edited (otherwise grouped automatically). */
  captionGroups?: Word[][];
  progressBar: boolean;
  colorBoost: boolean;
  vignette: boolean;
  accent: string;
  /** Pills, step cards, focus titles and the card-style hook. */
  cards: CompCard[];
  /** Alternate close/wide framing on each kept segment (jump-cut zoom). */
  cutZoom: boolean;
  theme: { panel: string; accent: string; text: string };
  /** True when effects were requested but skipped because the edit is long. */
  effectsLimited: boolean;
}

const EMOJI_SECONDS = 1.2;
const TEXT_SECONDS = 1.4;
const HOOK_SECONDS = 2.8;

export function composeEdit(input: {
  words: Word[];
  silences: TimeRange[];
  info: VideoInfo;
  settings: EditSettings;
  plan: EffectsPlan | null;
}): Composition {
  const { words, silences, info, settings, plan } = input;
  const preset = PRESETS[settings.preset];
  const captionPreset = PRESETS[settings.captionStyle];

  const cuts = findCuts(words, silences, info.duration, {
    threshold: settings.silenceThreshold,
    removeFillers: settings.removeFillers,
  });
  const edl = buildEDL(info.duration, cuts);
  // Key words the AI flagged stand out in the captions.
  const emphasis = settings.effects.length ? (plan?.emphasis ?? []) : [];
  const flagged = words.map((w) =>
    emphasis.some((r) => w.start < r.end && r.start < w.end) ? { ...w, emphasis: true } : w,
  );
  const outWords = retimeWords(edl, flagged);
  const D = edl.outputDuration;

  const comp: Composition = {
    edl,
    vertical: settings.verticalCrop,
    words: settings.captions ? outWords : [],
    caption: settings.captions ? captionPreset.caption : null,
    hook: null,
    hookFont: preset.hookFont,
    zooms: [],
    flashes: [],
    emojis: [],
    texts: [],
    sfx: [],
    sfxVolume: preset.sfxVolume,
    music: null,
    progressBar: false,
    colorBoost: false,
    vignette: false,
    accent: captionPreset.caption.highlight,
    cards: [],
    cutZoom: false,
    theme: preset.theme,
    effectsLimited: false,
  };

  // Music is independent of the effects toggle.
  const mood: MusicMood | "custom" | "none" =
    settings.music === "auto" ? (plan?.music.mood ?? preset.defaultMusic) : settings.music;
  if (mood === "custom") comp.music = { source: "custom", volume: preset.musicVolume || 0.12 };
  else if (mood !== "none") comp.music = { source: "bundled", mood, volume: preset.musicVolume || 0.12 };

  const on = new Set(settings.effects);
  // Looks are cheap whole-video filters, so they apply at any length.
  comp.colorBoost = on.has("colorBoost");
  comp.vignette = on.has("vignette");
  if (on.size === 0) return comp;
  if (D > MAX_EFFECTS_SECONDS) {
    comp.effectsLimited = [...on].some((k) => k !== "colorBoost" && k !== "vignette");
    return comp;
  }

  comp.progressBar = on.has("progress");
  comp.cutZoom = on.has("cutZoom");
  if (!plan) return comp;
  if (plan.hook && on.has("hook")) {
    // The hook is a card in every style: two-tone title with an optional
    // sticker, animated by HyperFrames when the overlay server is available.
    comp.cards.push({
      kind: "hook",
      start: 0.1,
      end: Math.min(D, HOOK_SECONDS + 0.2),
      text: plan.hook,
      ...(plan.hookAccent ? { accent: plan.hookAccent } : {}),
      ...(plan.hookSticker ? { sticker: plan.hookSticker } : {}),
    });
  }
  const wantZoom = on.has("zoom");
  const wantShake = on.has("shake");
  const wantSfx = on.has("sfx");

  // A card's sound plays just before it; when that card type is off, so is its sound.
  const mutedCardTimes = plan.effects
    .filter((e) => e.type === "card" && !on.has(e.kind === "pill" ? "pills" : "cards"))
    .map((e) => (e.type === "card" ? e.at : 0));
  const sfx: SfxCue[] = [];
  for (const e of plan.effects) {
    switch (e.type) {
      case "zoom": {
        if (!wantZoom && !wantShake) break;
        const r = toOutputRange(edl, e.start, e.end);
        if (r && r.end - r.start >= 0.5) {
          const style = e.style ?? "punch";
          const shake = wantShake && Boolean(e.shake);
          // Only zooms marked for shake (punchlines) shake; with zooms off they
          // become a short shake with a slight push-in to give it room.
          if (!wantZoom && !shake) break;
          const zoom = wantZoom ? e.scale : 1.06;
          const end = wantZoom ? r.end : Math.min(r.end, r.start + 0.6);
          comp.zooms.push({ start: r.start, end, scale: zoom, shake, style: wantZoom ? style : "punch" });
        }
        break;
      }
      case "emoji": {
        const t = toOutputTime(edl, e.at);
        if (t === null) break;
        if (on.has("emoji")) {
          comp.emojis.push({ emoji: e.emoji, start: t, end: Math.min(D, t + EMOJI_SECONDS) });
        }
        if (e.sfx) sfx.push({ sound: e.sfx, at: t });
        break;
      }
      case "text": {
        if (!on.has("text")) break;
        const t = toOutputTime(edl, e.at);
        if (t === null) break;
        comp.cards.push({ kind: "pop", start: t, end: Math.min(D, t + TEXT_SECONDS), text: e.text, style: e.style });
        break;
      }
      case "sfx": {
        if (mutedCardTimes.some((c) => c >= e.at && c - e.at < 0.15)) break;
        const t = toOutputTime(edl, e.at);
        if (t !== null) sfx.push({ sound: e.sound, at: t });
        break;
      }
      case "card": {
        if (!on.has(e.kind === "pill" ? "pills" : "cards")) break;
        const t = toOutputTime(edl, e.at);
        if (t === null) break;
        comp.cards.push({
          kind: e.kind,
          start: t,
          end: Math.min(D, t + (e.end - e.at)),
          text: e.text,
          ...(e.label ? { label: e.label } : {}),
        });
        break;
      }
    }
  }
  // One card at a time in each screen area: pills, step cards and the hook all
  // sit at the top; a focus title takes the whole frame. The hook always wins,
  // then the earlier card.
  const zone = (c: CompCard) => (c.kind === "focus" ? "center" : "top");
  const ordered = [...comp.cards].sort(
    (a, b) => Number(b.kind === "hook") - Number(a.kind === "hook") || a.start - b.start,
  );
  const kept: CompCard[] = [];
  for (const c of ordered) {
    const clash = kept.some(
      (k) => c.start < k.end && k.start < c.end && (zone(k) === zone(c) || zone(k) === "center" || zone(c) === "center"),
    );
    if (!clash) kept.push(c);
  }
  comp.cards = kept.sort((a, b) => a.start - b.start);

  // Emoji and text pops share the same screen area; text wins.
  comp.emojis = comp.emojis.filter(
    (em) => !comp.cards.some((t) => t.kind === "pop" && em.start < t.end && t.start < em.end),
  );

  // Flash transitions + whoosh at the biggest cuts, spread out.
  const perMinute = on.has("transitions")
    ? Math.max(preset.transitionsPerMinute, MIN_TRANSITIONS_PER_MINUTE) * INTENSITY_SCALE[settings.intensity]
    : 0;
  if (perMinute > 0) {
    const max = Math.max(1, Math.round((perMinute * D) / 60));
    const candidates = cutPoints(edl)
      .filter((c) => c.removed >= 0.6 && c.at > 1 && c.at < D - 1)
      .sort((a, b) => b.removed - a.removed);
    const chosen: number[] = [];
    for (const c of candidates) {
      if (chosen.length >= max) break;
      if (chosen.every((x) => Math.abs(x - c.at) >= 5)) chosen.push(c.at);
    }
    comp.flashes = chosen.sort((a, b) => a - b);
    for (const at of comp.flashes) sfx.push({ sound: "whoosh", at: Math.max(0, at - 0.15) });
  }

  // De-duplicate and cap sound effects per minute.
  sfx.sort((a, b) => a.at - b.at);
  const spaced: SfxCue[] = [];
  for (const s of sfx) {
    const prev = spaced[spaced.length - 1];
    if (!prev || s.at - prev.at >= 0.3) spaced.push(s);
  }
  const caps = effectCaps(settings.preset, { effects: settings.effects, intensity: settings.intensity });
  const sfxMax = caps.sfx > 0 ? Math.max(1, Math.round((caps.sfx * D) / 60)) : 0;
  // Over the cap: keep every whoosh on a transition, thin the rest evenly.
  const isTransition = (c: SfxCue) => c.sound === "whoosh" && comp.flashes.some((f) => Math.abs(f - 0.15 - c.at) < 0.01);
  const fixed = spaced.filter(isTransition);
  const rest = spaced.filter((c) => !isTransition(c));
  const room = Math.max(0, sfxMax - fixed.length);
  const step = rest.length / Math.max(room, 1);
  const thinned = rest.length <= room ? rest : Array.from({ length: room }, (_, i) => rest[Math.floor(i * step)]);
  comp.sfx = wantSfx ? [...fixed, ...thinned].sort((a, b) => a.at - b.at) : [];
  // Presets without their own SFX level (Podcast) still need an audible one.
  comp.sfxVolume = preset.sfxVolume || 0.45;

  return comp;
}

export const hookDuration = (comp: Composition) => Math.min(HOOK_SECONDS, comp.edl.outputDuration);
