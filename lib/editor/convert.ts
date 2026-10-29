import type { EditSettings, PresetId, VideoInfo, Word } from "@/types";
import { PRESETS } from "@/lib/presets";
import { groupWords } from "@/lib/engine/ass";
import type { CompCard, Composition } from "@/lib/engine/compose";
import { clipRanges, projectDuration } from "./ops";
import {
  SFX_DURATIONS,
  uid,
  type CaptionGroup,
  type Project,
  type TextAnimation,
  type TextItem,
  type TextVariant,
} from "./project";

/**
 * Where each kind of card sits by default: x is the centre, y the top edge,
 * as fractions of the frame. These match the renderer's defaults, so an
 * untouched AI card looks exactly the same after a round trip.
 */
export const DEFAULT_TEXT_POSITION: Record<TextVariant, { x: number; y: number }> = {
  hook: { x: 0.5, y: 0.085 },
  pill: { x: 0.5, y: 0.065 },
  step: { x: 0.5, y: 0.11 },
  pop: { x: 0.5, y: 0.26 },
  focus: { x: 0.5, y: 0.366 },
  plain: { x: 0.5, y: 0.45 },
};

/** One text item as the renderer's card (also used by the preview). */
export function textToCard(t: TextItem): CompCard {
  return {
    id: t.id,
    kind: t.variant === "plain" ? "text" : t.variant,
    start: t.start,
    end: t.end,
    text: t.text,
    ...(t.label ? { label: t.label } : {}),
    ...(t.accent ? { accent: t.accent } : {}),
    ...(t.sticker ? { sticker: t.sticker } : {}),
    ...(t.style ? { style: t.style } : {}),
    // Only a moved item carries a position; untouched ones keep the
    // renderer's own (aspect-aware) placement.
    ...(isDefaultSpot(t) ? {} : { x: t.x, y: t.y }),
    ...(t.variant === "plain" ? { font: t.font, size: t.size, color: t.color, animation: t.animation } : {}),
  };
}

function isDefaultSpot(t: TextItem) {
  const d = DEFAULT_TEXT_POSITION[t.variant];
  return t.variant !== "plain" && t.x === d.x && t.y === d.y;
}

/** Default spot for stickers (centre, fractions of the frame). */
export const DEFAULT_STICKER = { x: 0.5, y: 0.32, size: 0.2 };

const ENTRANCE: Record<TextVariant, TextAnimation> = {
  hook: "pop",
  pill: "slide",
  step: "slide",
  pop: "bounce",
  focus: "pop",
  plain: "fade",
};

/** A new plain text item with sensible defaults. */
export function newTextItem(start: number, end: number, text = "Your text"): TextItem {
  return {
    id: uid("text"),
    start,
    end,
    text,
    variant: "plain",
    font: "Poppins Black",
    size: 0.08,
    color: "#FFFFFF",
    ...DEFAULT_TEXT_POSITION.plain,
    animation: "fade",
  };
}

function captionGroups(comp: Composition): CaptionGroup[] {
  const max = comp.caption?.maxWords ?? 3;
  const chunks = comp.captionGroups ?? groupWords(comp.words, max);
  return chunks.map((chunk, i) => {
    const next = chunks[i + 1]?.[0].start ?? Infinity;
    return {
      id: uid("cap"),
      start: chunk[0].start,
      end: Math.min(chunk[chunk.length - 1].end + 0.3, next),
      words: chunk.map((w) => ({ text: w.word, start: w.start, end: w.end, ...(w.emphasis ? { emphasis: true } : {}) })),
    };
  });
}

/**
 * Turns the AI's edit (a Composition from composeEdit) into an editable
 * Project. `musicTrack` is the bundled track that was actually used, if known.
 */
export function projectFromComposition(
  comp: Composition,
  info: VideoInfo,
  settings: Pick<EditSettings, "preset" | "captionStyle">,
  musicTrack?: { file: string; title: string } | null,
): Project {
  const D = comp.edl.outputDuration;
  const captionStyle: PresetId = settings.captionStyle;

  const texts: TextItem[] = comp.cards.map((c) => {
    const variant: TextVariant = c.kind === "text" ? "plain" : c.kind;
    return {
      id: uid("text"),
      start: c.start,
      end: c.end,
      text: c.text,
      variant,
      ...(c.label ? { label: c.label } : {}),
      ...(c.accent ? { accent: c.accent } : {}),
      ...(c.sticker ? { sticker: c.sticker } : {}),
      ...(c.style ? { style: c.style } : {}),
      font: "Poppins Black",
      size: c.size ?? 0.08,
      color: c.color ?? "#FFFFFF",
      x: c.x ?? DEFAULT_TEXT_POSITION[variant].x,
      y: c.y ?? DEFAULT_TEXT_POSITION[variant].y,
      animation: c.animation ?? ENTRANCE[variant],
    };
  });
  // Older plans may still carry subtitle-drawn text pops.
  for (const t of comp.texts) {
    texts.push({
      ...newTextItem(t.start, t.end, t.text),
      variant: "pop",
      style: t.style,
      ...DEFAULT_TEXT_POSITION.pop,
      animation: "bounce",
    });
  }

  return {
    version: 1,
    info,
    clips: comp.edl.segments.map((s) => ({ id: uid("clip"), sourceIn: s.start, sourceOut: s.end })),
    texts,
    captions: {
      enabled: comp.caption !== null,
      style: captionStyle,
      groups: comp.caption ? captionGroups(comp) : [],
    },
    stickers: comp.emojis.map((e) => ({
      id: uid("stk"),
      start: e.start,
      end: e.end,
      emoji: e.emoji,
      x: e.x ?? DEFAULT_STICKER.x,
      y: e.y ?? DEFAULT_STICKER.y,
      size: e.size ?? DEFAULT_STICKER.size,
    })),
    sfx: comp.sfx.map((s) => ({
      id: uid("sfx"),
      start: s.at,
      duration: SFX_DURATIONS[s.sound],
      sound: s.sound,
      volume: s.volume ?? 1,
    })),
    music: comp.music
      ? [
          {
            id: uid("music"),
            start: comp.music.start ?? 0,
            end: comp.music.end ?? D,
            source:
              comp.music.source === "custom"
                ? { kind: "custom", name: "Your music" }
                : {
                    kind: "bundled",
                    mood: comp.music.mood,
                    ...(musicTrack ? { file: musicTrack.file, title: musicTrack.title } : {}),
                  },
            volume: comp.music.volume,
            fadeIn: comp.music.fadeIn ?? 0.5,
            fadeOut: comp.music.fadeOut ?? 1.5,
            ducking: comp.music.ducking ?? true,
          },
        ]
      : [],
    zooms: comp.zooms.map((z) => ({
      id: uid("zoom"),
      start: z.start,
      end: z.end,
      scale: z.scale,
      style: z.style,
      shake: z.shake,
    })),
    transitions: comp.flashes.map((at) => ({ id: uid("tr"), at, kind: "flash" })),
    settings: {
      preset: settings.preset,
      vertical: comp.vertical,
      cutZoom: comp.cutZoom,
      colorBoost: comp.colorBoost,
      vignette: comp.vignette,
      progressBar: comp.progressBar,
      theme: comp.theme,
      sfxVolume: comp.sfxVolume,
    },
  };
}

/**
 * Adapter for the existing renderer: turns a Project back into the
 * Composition that renderEdit() understands.
 */
export function projectToComposition(p: Project): Composition {
  const D = projectDuration(p);
  const preset = PRESETS[p.settings.preset];
  const captionPreset = PRESETS[p.captions.style];
  const groups: Word[][] = p.captions.enabled
    ? p.captions.groups
        .slice()
        .sort((a, b) => a.start - b.start)
        .map((g) => g.words.map((w) => ({ word: w.text, start: w.start, end: w.end, ...(w.emphasis ? { emphasis: true } : {}) })))
        .filter((g) => g.length)
    : [];

  const cards: CompCard[] = p.texts
    .slice()
    .sort((a, b) => a.start - b.start)
    .map(textToCard);

  const music = p.music[0];
  const ranges = clipRanges(p.clips);
  return {
    edl: {
      sourceDuration: p.info.duration,
      segments: ranges.map((c) => ({ start: c.sourceIn, end: c.sourceOut })),
      outputDuration: D,
    },
    vertical: p.settings.vertical,
    words: groups.flat(),
    captionGroups: groups,
    caption: p.captions.enabled ? captionPreset.caption : null,
    hook: null,
    hookFont: preset.hookFont,
    zooms: p.zooms.map((z) => ({ start: z.start, end: z.end, scale: z.scale, shake: z.shake, style: z.style })),
    flashes: p.transitions.map((t) => t.at).sort((a, b) => a - b),
    emojis: p.stickers.map((s) => ({
      id: s.id,
      start: s.start,
      end: s.end,
      emoji: s.emoji,
      ...(s.x === DEFAULT_STICKER.x && s.y === DEFAULT_STICKER.y ? {} : { x: s.x, y: s.y }),
      ...(s.size === DEFAULT_STICKER.size ? {} : { size: s.size }),
    })),
    texts: [],
    sfx: p.sfx
      .map((s) => ({ sound: s.sound, at: s.start, ...(s.volume !== 1 ? { volume: s.volume } : {}) }))
      .sort((a, b) => a.at - b.at),
    sfxVolume: p.settings.sfxVolume,
    music: music
      ? {
          ...(music.source.kind === "custom"
            ? { source: "custom" as const }
            : { source: "bundled" as const, mood: music.source.mood, ...(music.source.file ? { file: music.source.file } : {}) }),
          volume: music.volume,
          start: music.start,
          end: music.end,
          fadeIn: music.fadeIn,
          fadeOut: music.fadeOut,
          ducking: music.ducking,
        }
      : null,
    progressBar: p.settings.progressBar,
    colorBoost: p.settings.colorBoost,
    vignette: p.settings.vignette,
    accent: captionPreset.caption.highlight,
    cards,
    cutZoom: p.settings.cutZoom,
    theme: p.settings.theme,
    effectsLimited: false,
  };
}
