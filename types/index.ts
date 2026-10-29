/** One transcribed word with times on the original video timeline (seconds). */
export interface Word {
  word: string;
  start: number;
  end: number;
  /** Key word the AI wants to stand out in captions. */
  emphasis?: boolean;
}

export interface Transcript {
  language?: string;
  duration: number;
  words: Word[];
}

/** A time range in seconds. */
export interface TimeRange {
  start: number;
  end: number;
}

/** Edit Decision List: the parts of the original video to keep, in order. */
export interface EDL {
  /** Length of the source video (seconds). */
  sourceDuration: number;
  /** Segments to keep, sorted and non-overlapping, on the original timeline. */
  segments: TimeRange[];
  /** Length of the edited video (seconds). */
  outputDuration: number;
}

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  /** Display rotation in degrees from the file's metadata (0, 90, 180, 270). */
  rotation?: number;
}

export const PRESET_IDS = ["energetic", "clean", "funny", "podcast", "creator"] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export type UsageStatus =
  | "started"
  | "transcribed"
  | "planned"
  | "rendered"
  | "failed";

export const SFX_NAMES = [
  "whoosh",
  "whoosh2",
  "pop",
  "ding",
  "click",
  "swoosh-up",
  "swoosh-down",
  "boom",
  "scratch",
  "shutter",
  "typing",
  "bell",
] as const;
export type SfxName = (typeof SFX_NAMES)[number];

export const MUSIC_MOODS = ["upbeat", "chill", "dramatic", "playful", "none"] as const;
export type MusicMood = (typeof MUSIC_MOODS)[number];

export type TextStyle = "bounce" | "pop" | "shake";

/** Kinds of moments the AI director looks for; each maps to an effect recipe. */
export const MOMENT_TYPES = [
  "key_point",
  "punchline",
  "reveal",
  "number",
  "list_item",
  "question",
  "emotional",
  "reaction",
  "call_to_action",
  "pill",
  "step",
  "focus",
] as const;
export type MomentType = (typeof MOMENT_TYPES)[number];

/** A moment in the video that deserves emphasis (original timeline). */
export interface Moment {
  type: MomentType;
  start: number;
  end: number;
  /** Text pop / card wording, max 4–6 words depending on type. */
  text?: string;
  emoji?: string;
  /** Step cards: the label before the headline, e.g. "STEP 1". */
  label?: string;
}

export type CardKind = "pill" | "step" | "focus";

export type ZoomStyle = "punch" | "slow";

export type Effect =
  | { type: "zoom"; start: number; end: number; scale: number; style?: ZoomStyle; shake?: boolean }
  | { type: "emoji"; at: number; emoji: string; sfx?: SfxName }
  | { type: "text"; at: number; text: string; style: TextStyle }
  | { type: "sfx"; at: number; sound: SfxName }
  | { type: "card"; kind: CardKind; at: number; end: number; text: string; label?: string };

/** The AI director's plan. Times are on the original video timeline. */
export interface EffectsPlan {
  hook: string;
  /** Word(s) of the hook to show in the accent colour. */
  hookAccent?: string;
  /** Short sticker under the hook title, e.g. "NO COURSE NEEDED". */
  hookSticker?: string;
  music: { mood: MusicMood; volume: number };
  effects: Effect[];
  /** The moments the AI picked (for display); effects are derived from them. */
  moments?: Moment[];
  /** Spans of key words to highlight in captions. */
  emphasis?: TimeRange[];
  highlights?: { start: number; end: number; score: number; reason: string }[];
}

/** Effects the user can switch on and off individually. */
export const EFFECT_KINDS = [
  "zoom",
  "shake",
  "emoji",
  "text",
  "transitions",
  "sfx",
  "hook",
  "progress",
  "colorBoost",
  "vignette",
  "cutZoom",
  "pills",
  "cards",
] as const;
export type EffectKind = (typeof EFFECT_KINDS)[number];

export type EffectIntensity = "less" | "normal" | "more";

/** "auto" uses the mood the AI picked; "custom" uses a file the user added. */
export type MusicChoice = "auto" | "custom" | MusicMood;

/** What the vision model saw in the video's snapshots. */
export interface VideoAnalysis {
  summary: string;
  contentType: string;
  energy: "low" | "medium" | "high";
  mood: string;
}

export type Pacing = "tight" | "balanced" | "relaxed";

/** Edit choices the AI made in auto mode. */
export interface AutoDecisions {
  preset: PresetId;
  captionStyle: PresetId;
  effects: EffectKind[];
  intensity: EffectIntensity;
  removeFillers: boolean;
  pacing: Pacing;
  /** One sentence on why, shown to the user. */
  reason: string;
}

/** Simple numbers about the video, sent with the transcript in auto mode. */
export interface VideoStats {
  orientation: "portrait" | "landscape" | "square";
  /** Share of the video with someone speaking (0–1). */
  speechRatio: number;
  wordsPerMinute: number;
}

export interface EditSettings {
  /** Let the AI choose style, effects, amount, pacing and filler removal. */
  auto: boolean;
  /** In auto mode, send a few low-res snapshots so the AI can see the video. */
  shareFrames: boolean;
  /** Gaps between words longer than this (seconds) are cut. */
  silenceThreshold: number;
  /** "auto" lets Whisper detect the language. */
  language: "auto" | "en" | "tl";
  /** Drives the AI plan's effect density, SFX and music. */
  preset: PresetId;
  captions: boolean;
  /** Caption look; defaults to the preset's. */
  captionStyle: PresetId;
  removeFillers: boolean;
  /** Crop landscape video to 9:16. */
  verticalCrop: boolean;
  /** Which effects to add. Empty means cuts, captions and music only. */
  effects: EffectKind[];
  /** How many effects per minute, relative to the preset. */
  intensity: EffectIntensity;
  music: MusicChoice;
}

export type ApiErrorCode =
  | "DAILY_LIMIT"
  | "RATE_LIMITED"
  | "FILE_TOO_LARGE"
  | "BAD_PLAN"
  | "UPSTREAM_ERROR"
  | "BAD_REQUEST";

export interface ApiError {
  error: ApiErrorCode;
  message?: string;
  resetsAt?: string;
  retryAfter?: number;
}

export interface SessionResponse {
  usageId: number;
  remainingToday: number;
}

export interface TranscribeResponse {
  chunkIndex: number;
  language?: string;
  words: Word[];
}
