import type { EffectIntensity, EffectKind, MusicMood, PresetId } from "@/types";

export interface CaptionStyle {
  /** Font family name as libass sees it (files in public/fonts). */
  font: string;
  /** Font size as a fraction of the output's shorter side. */
  size: number;
  /** Colors as #RRGGBB. */
  color: string;
  highlight: string;
  outline: string;
  /** Outline width as a fraction of font size. */
  outlineWidth: number;
  shadow: number;
  uppercase: boolean;
  /** Max words shown at once. */
  maxWords: number;
  /** Highlight + pop the word being spoken. */
  wordHighlight: boolean;
  /** Distance from the bottom, as a fraction of output height. */
  marginBottom: number;
}

/** Effects per minute of final video: [min, max]. */
export interface EffectCaps {
  zooms: [number, number];
  emoji: [number, number];
  text: [number, number];
  sfx: [number, number];
}

export interface PresetConfig {
  id: PresetId;
  label: string;
  tagline: string;
  icon: string;
  caption: CaptionStyle;
  caps: EffectCaps;
  /** Seconds between zooms the AI should aim for. */
  zoomEvery: [number, number];
  zoomScale: number;
  /** Minimum seconds between punch zooms, so they only land on real moments. */
  zoomGap: number;
  /** Camera shake during zooms. */
  shake: boolean;
  /** Flash transitions (with a whoosh) at the biggest cuts, per minute. */
  transitionsPerMinute: number;
  defaultMusic: MusicMood;
  musicVolume: number;
  sfxVolume: number;
  progressBar: boolean;
  hookFont: string;
  /** Colours for cards, pills and the hook: dark panel, accent, text. */
  theme: { panel: string; accent: string; text: string };
  /** One word on screen at a time, mid-frame (the "creator" caption look). */
  singleWordCaptions?: boolean;
  /** Effects switched on when this preset is picked (the user can change them). */
  defaultEffects: EffectKind[];
}

export const PRESETS: Record<PresetId, PresetConfig> = {
  energetic: {
    id: "energetic",
    label: "Energetic",
    tagline: "Bold captions, punchy zooms, lots of SFX",
    icon: "⚡",
    caption: {
      font: "Poppins Black",
      size: 0.076,
      color: "#FFFFFF",
      highlight: "#C8FF2E",
      outline: "#000000",
      outlineWidth: 0.14,
      shadow: 4,
      uppercase: true,
      maxWords: 3,
      wordHighlight: true,
      marginBottom: 0.22,
    },
    caps: { zooms: [3, 6], emoji: [2, 4], text: [2, 3], sfx: [6, 10] },
    zoomEvery: [4, 8],
    zoomScale: 1.2,
    zoomGap: 5,
    shake: false,
    transitionsPerMinute: 4,
    defaultMusic: "upbeat",
    musicVolume: 0.14,
    sfxVolume: 0.55,
    progressBar: true,
    hookFont: "Poppins Black",
    theme: { panel: "#111418", accent: "#C8FF2E", text: "#FFFFFF" },
    defaultEffects: ["zoom", "emoji", "text", "transitions", "sfx", "hook", "progress", "colorBoost"],
  },
  clean: {
    id: "clean",
    label: "Clean",
    tagline: "Subtle white captions, calm pacing",
    icon: "✨",
    caption: {
      font: "Poppins Bold",
      size: 0.064,
      color: "#FFFFFF",
      highlight: "#FFFFFF",
      outline: "#000000",
      outlineWidth: 0.09,
      shadow: 2,
      uppercase: false,
      maxWords: 4,
      wordHighlight: false,
      marginBottom: 0.16,
    },
    caps: { zooms: [1, 3], emoji: [0, 0], text: [1, 2], sfx: [0, 2] },
    zoomEvery: [12, 20],
    zoomScale: 1.1,
    zoomGap: 10,
    shake: false,
    transitionsPerMinute: 0,
    defaultMusic: "chill",
    musicVolume: 0.1,
    sfxVolume: 0.4,
    progressBar: false,
    hookFont: "Poppins ExtraBold",
    theme: { panel: "#15181D", accent: "#FFFFFF", text: "#FFFFFF" },
    defaultEffects: ["zoom", "text", "hook"],
  },
  funny: {
    id: "funny",
    label: "Funny",
    tagline: "Comic captions, emoji, shakes, meme SFX",
    icon: "😂",
    caption: {
      font: "Bangers",
      size: 0.088,
      color: "#FFFFFF",
      highlight: "#FFD60A",
      outline: "#000000",
      outlineWidth: 0.12,
      shadow: 3,
      uppercase: true,
      maxWords: 3,
      wordHighlight: true,
      marginBottom: 0.22,
    },
    caps: { zooms: [3, 6], emoji: [3, 5], text: [2, 4], sfx: [8, 12] },
    zoomEvery: [5, 9],
    zoomScale: 1.25,
    zoomGap: 5,
    shake: true,
    transitionsPerMinute: 4,
    defaultMusic: "playful",
    musicVolume: 0.14,
    sfxVolume: 0.6,
    progressBar: true,
    hookFont: "Bangers",
    theme: { panel: "#1A1033", accent: "#FFD60A", text: "#FFFFFF" },
    defaultEffects: ["zoom", "shake", "emoji", "text", "transitions", "sfx", "hook", "progress", "colorBoost"],
  },
  podcast: {
    id: "podcast",
    label: "Podcast",
    tagline: "Readable two-line captions, minimal effects",
    icon: "🎙️",
    caption: {
      font: "Poppins ExtraBold",
      size: 0.062,
      color: "#FFFFFF",
      highlight: "#7DD3FC",
      outline: "#000000",
      outlineWidth: 0.1,
      shadow: 2,
      uppercase: false,
      maxWords: 5,
      wordHighlight: true,
      marginBottom: 0.16,
    },
    caps: { zooms: [0, 2], emoji: [0, 0], text: [0, 1], sfx: [0, 0] },
    zoomEvery: [25, 40],
    zoomScale: 1.08,
    zoomGap: 20,
    shake: false,
    transitionsPerMinute: 0,
    defaultMusic: "none",
    musicVolume: 0.08,
    sfxVolume: 0,
    progressBar: false,
    hookFont: "Poppins ExtraBold",
    theme: { panel: "#0F172A", accent: "#7DD3FC", text: "#FFFFFF" },
    defaultEffects: ["hook"],
  },
  creator: {
    id: "creator",
    label: "Creator",
    tagline: "One-word captions, step cards, context pills",
    icon: "🎬",
    caption: {
      font: "Poppins Black",
      size: 0.085,
      color: "#FFFFFF",
      highlight: "#FFC93C",
      outline: "#000000",
      outlineWidth: 0.1,
      shadow: 4,
      uppercase: true,
      maxWords: 1,
      wordHighlight: false,
      marginBottom: 0.34,
    },
    caps: { zooms: [0, 2], emoji: [0, 0], text: [0, 1], sfx: [3, 6] },
    zoomEvery: [8, 15],
    zoomScale: 1.1,
    zoomGap: 8,
    shake: false,
    transitionsPerMinute: 0,
    defaultMusic: "chill",
    musicVolume: 0.08,
    sfxVolume: 0.4,
    progressBar: false,
    hookFont: "Poppins Black",
    theme: { panel: "#141A26", accent: "#FFC93C", text: "#FFFFFF" },
    singleWordCaptions: true,
    defaultEffects: ["cutZoom", "pills", "cards", "hook", "sfx"],
  },
};

export interface EffectInfo {
  id: EffectKind;
  label: string;
  hint: string;
  icon: string;
}

/** Effect picker entries, in display order. */
export const EFFECT_INFO: EffectInfo[] = [
  { id: "zoom", label: "Zoom punch-ins", hint: "Quick zooms on key lines", icon: "🔍" },
  { id: "shake", label: "Camera shake", hint: "Shake on big moments", icon: "📳" },
  { id: "emoji", label: "Emoji pops", hint: "Emoji that match your words", icon: "😎" },
  { id: "text", label: "Text pops", hint: "Big words on strong lines", icon: "💬" },
  { id: "transitions", label: "Flash transitions", hint: "White flash at big cuts", icon: "⚡" },
  { id: "sfx", label: "Sound effects", hint: "Whoosh, pop, ding, boom…", icon: "🔊" },
  { id: "hook", label: "Hook title", hint: "Catchy title for the first 3 s", icon: "🪝" },
  { id: "progress", label: "Progress bar", hint: "Thin bar along the bottom", icon: "➖" },
  { id: "colorBoost", label: "Color boost", hint: "Punchier colors and contrast", icon: "🎨" },
  { id: "vignette", label: "Cinematic vignette", hint: "Darker edges, focus on center", icon: "🎬" },
  { id: "cutZoom", label: "Jump-cut zoom", hint: "Alternate close/wide framing at each cut", icon: "🎞️" },
  { id: "pills", label: "Context pills", hint: "Small labels that sum up a claim", icon: "🏷️" },
  { id: "cards", label: "Step & focus cards", hint: "STEP cards and big focus titles", icon: "🪧" },
];

/** Multiplier on per-minute caps for each intensity. */
export const INTENSITY_SCALE: Record<EffectIntensity, number> = {
  less: 0.5,
  normal: 1,
  more: 1.6,
};

/**
 * Floor for per-minute caps when the user switches on an effect the preset
 * doesn't normally use (e.g. emoji in Clean).
 */
export const MIN_CAPS = { zooms: 2, emoji: 2, text: 1, sfx: 3 } as const;

/** Effect transitions per minute when a preset doesn't define any. */
export const MIN_TRANSITIONS_PER_MINUTE = 2;

export const PRESET_LIST = Object.values(PRESETS);

/** Font files bundled in public/fonts, loaded into ffmpeg for captions. */
export const FONT_FILES = [
  "Poppins-Black.ttf",
  "Poppins-ExtraBold.ttf",
  "Poppins-Bold.ttf",
  "Poppins-SemiBold.ttf",
  "Bangers-Regular.ttf",
  // Fallback for ₱, which Poppins doesn't have.
  "Anton-Regular.ttf",
];

/** Fonts that include the peso sign (₱). Other fonts borrow it from Anton. */
export const FONTS_WITH_PESO = new Set(["Bangers", "Anton"]);

/** Emoji the AI may use. Anything else is dropped as untrusted output. */
export const ALLOWED_EMOJI = [
  "😂", "🤣", "😅", "😊", "😍", "🥰", "😎", "🤔", "😮", "😱", "😭", "😤", "😡", "🙄", "😴", "🤯",
  "🥳", "🤩", "😬", "🙏", "👏", "👍", "👎", "👀", "💪", "🔥", "💯", "✨", "⭐", "💡", "💰", "💸",
  "📈", "📉", "🚀", "🎯", "✅", "❌", "⚠️", "❤️", "💔", "🎉", "🏆", "⏰", "📱", "💻", "🍕", "☕",
  "🎵", "📸", "🛒", "🎁", "🤝", "🧠", "💀", "🤫", "🙌", "👉", "👇", "🇵🇭",
];

/** Effects are limited to edits this long (seconds of final video). */
export const MAX_EFFECTS_SECONDS = 180;
