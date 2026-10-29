import type {
  MusicMood,
  PresetId,
  SfxName,
  TextStyle,
  VideoInfo,
  ZoomStyle,
} from "@/types";

/**
 * The editable project: single source of truth for the editor's preview and
 * for export. Built from the AI's edit (see convert.ts) and turned back into
 * a Composition for the existing renderer.
 *
 * Times: clips use SOURCE time (sourceIn/sourceOut into the uploaded video).
 * Everything else uses OUTPUT time (seconds into the edited video, after cuts).
 */

/** A kept piece of the source video. Clips play in source order, back to back. */
export interface Clip {
  id: string;
  sourceIn: number;
  sourceOut: number;
}

export type TextAnimation = "none" | "fade" | "pop" | "bounce" | "slide";

/**
 * "plain" is text the user adds; the other variants are the AI's cards
 * (hook title, text pop, pill, step card, focus title) and keep their look.
 */
export type TextVariant = "plain" | "hook" | "pop" | "pill" | "step" | "focus";

export interface TextItem {
  id: string;
  start: number;
  end: number;
  text: string;
  variant: TextVariant;
  /** Step cards: "STEP 1". Hook: accent words and sticker. Pops: animation style. */
  label?: string;
  accent?: string;
  sticker?: string;
  style?: TextStyle;
  /** Plain text look. */
  font: CaptionFont;
  /** Font size as a fraction of the frame's shorter side. */
  size: number;
  color: string;
  /** Centre of the item as fractions of the frame (0–1). */
  x: number;
  y: number;
  animation: TextAnimation;
}

export const CAPTION_FONTS = ["Poppins Black", "Poppins ExtraBold", "Poppins Bold", "Poppins SemiBold", "Bangers"] as const;
export type CaptionFont = (typeof CAPTION_FONTS)[number];

/** One on-screen caption group (output time); words keep their own timing. */
export interface CaptionGroup {
  id: string;
  start: number;
  end: number;
  words: { text: string; start: number; end: number; emphasis?: boolean }[];
}

export interface CaptionTrack {
  enabled: boolean;
  /** Caption look, from the presets. */
  style: PresetId;
  groups: CaptionGroup[];
}

export interface Sticker {
  id: string;
  start: number;
  end: number;
  emoji: string;
  x: number;
  y: number;
  /** Size as a fraction of the frame's shorter side. */
  size: number;
}

export interface SfxItem {
  id: string;
  /** Output time the sound starts. */
  start: number;
  /** Length of the sound file (seconds), for the timeline. */
  duration: number;
  sound: SfxName;
  volume: number;
}

export type MusicSource =
  | { kind: "bundled"; mood: MusicMood; file?: string; title?: string }
  | { kind: "custom"; name: string };

export interface MusicItem {
  id: string;
  start: number;
  end: number;
  source: MusicSource;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  /** Lower the music while someone talks. */
  ducking: boolean;
}

export interface ZoomItem {
  id: string;
  start: number;
  end: number;
  /** 1.0–1.5 */
  scale: number;
  style: ZoomStyle;
  shake: boolean;
}

export interface TransitionItem {
  id: string;
  /** Output time of the cut the transition sits on. */
  at: number;
  kind: "flash";
}

export interface ProjectSettings {
  preset: PresetId;
  vertical: boolean;
  cutZoom: boolean;
  colorBoost: boolean;
  vignette: boolean;
  progressBar: boolean;
  theme: { panel: string; accent: string; text: string };
  /** Master level for sound effects. */
  sfxVolume: number;
}

export interface Project {
  version: 1;
  info: VideoInfo;
  clips: Clip[];
  texts: TextItem[];
  captions: CaptionTrack;
  stickers: Sticker[];
  sfx: SfxItem[];
  music: MusicItem[];
  zooms: ZoomItem[];
  transitions: TransitionItem[];
  settings: ProjectSettings;
}

/** Overlay collections that live on the output timeline with a start and end. */
export const SPAN_TRACKS = ["texts", "stickers", "music", "zooms"] as const;
export type SpanTrack = (typeof SPAN_TRACKS)[number];

export type TrackName = SpanTrack | "sfx" | "transitions" | "captions" | "clips";

/** A reference to one item in the project, used for selection. */
export interface ItemRef {
  track: TrackName;
  id: string;
}

let counter = 0;
/** Short unique id for project items. */
export function uid(prefix = "i"): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}${(counter++).toString(36)}`;
}

/** Length (seconds) of each bundled sound, for the timeline. */
export const SFX_DURATIONS: Record<SfxName, number> = {
  whoosh: 0.55,
  whoosh2: 0.8,
  pop: 0.18,
  ding: 1.2,
  click: 0.04,
  "swoosh-up": 0.5,
  "swoosh-down": 0.5,
  boom: 1.2,
  scratch: 0.6,
  shutter: 0.22,
  typing: 0.7,
  bell: 1.6,
};
