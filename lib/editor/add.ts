import type { MusicMood, SfxName } from "@/types";
import { DEFAULT_STICKER, DEFAULT_TEXT_POSITION, newTextItem } from "./convert";
import { projectDuration } from "./ops";
import {
  SFX_DURATIONS,
  uid,
  type ItemRef,
  type Project,
  type ProjectSettings,
  type TextItem,
  type TextVariant,
} from "./project";

/**
 * Pure "add" functions for the asset panels: each places a new item at an
 * output time (usually the playhead, or where it was dropped on the timeline)
 * and returns the new project plus a reference to select it.
 */

/** Something dragged or clicked in an asset panel. */
export type Asset =
  | { kind: "text"; preset: TextPreset }
  | { kind: "sticker"; emoji: string }
  | { kind: "sfx"; sound: SfxName }
  | { kind: "music"; mood: MusicMood; file: string; title: string }
  | { kind: "custom-music"; name: string }
  | { kind: "zoom"; style: "punch" | "slow"; shake?: boolean }
  | { kind: "transition" };

export type TextPreset = "title" | "subtitle" | "pill" | "step" | "focus" | "pop";

export const TEXT_PRESETS: { id: TextPreset; label: string; hint: string }[] = [
  { id: "title", label: "Title", hint: "Big bold text" },
  { id: "subtitle", label: "Subtitle", hint: "Smaller text line" },
  { id: "pill", label: "Context pill", hint: "Small label at the top" },
  { id: "step", label: "Step card", hint: "STEP 1: headline + window" },
  { id: "focus", label: "Focus title", hint: "Huge title, blurred video" },
  { id: "pop", label: "Text pop", hint: "Bouncing words with a marker" },
];

const TEXT_SECONDS: Record<TextPreset, number> = { title: 3, subtitle: 3, pill: 3, step: 3.2, focus: 2.2, pop: 1.6 };

/** Clamps an item of `len` seconds to start inside the video. */
function place(p: Project, at: number, len: number) {
  const D = projectDuration(p);
  const L = Math.min(len, D);
  const start = Math.max(0, Math.min(D - L, at));
  return { start: Math.round(start * 1000) / 1000, end: Math.round((start + L) * 1000) / 1000 };
}

export function textForPreset(p: Project, preset: TextPreset, at: number): TextItem {
  const { start, end } = place(p, at, TEXT_SECONDS[preset]);
  if (preset === "title" || preset === "subtitle") {
    return {
      ...newTextItem(start, end, preset === "title" ? "YOUR TITLE" : "Your subtitle"),
      size: preset === "title" ? 0.1 : 0.055,
      font: preset === "title" ? "Poppins Black" : "Poppins ExtraBold",
      y: preset === "title" ? 0.4 : 0.6,
    };
  }
  const variant: TextVariant = preset;
  const text = { pill: "YOUR LABEL", step: "DO THIS", focus: "BIG IDEA", pop: "WOW" }[preset];
  return {
    ...newTextItem(start, end, text),
    variant,
    ...DEFAULT_TEXT_POSITION[variant],
    ...(preset === "step" ? { label: "STEP 1" } : {}),
    ...(preset === "pop" ? { style: "bounce" as const } : {}),
    animation: "slide",
  };
}

/** Adds an asset at output time `at`. */
export function addAsset(p: Project, asset: Asset, at: number): { project: Project; ref: ItemRef | null } {
  switch (asset.kind) {
    case "text": {
      const t = textForPreset(p, asset.preset, at);
      return { project: { ...p, texts: [...p.texts, t] }, ref: { track: "texts", id: t.id } };
    }
    case "sticker": {
      const id = uid("stk");
      const span = place(p, at, 1.5);
      return {
        project: { ...p, stickers: [...p.stickers, { id, ...span, emoji: asset.emoji, ...DEFAULT_STICKER }] },
        ref: { track: "stickers", id },
      };
    }
    case "sfx": {
      const id = uid("sfx");
      const duration = SFX_DURATIONS[asset.sound];
      const { start } = place(p, at, duration);
      return {
        project: { ...p, sfx: [...p.sfx, { id, start, duration, sound: asset.sound, volume: 1 }] },
        ref: { track: "sfx", id },
      };
    }
    case "music":
    case "custom-music": {
      // One music bed: a new track replaces the old one but keeps its settings.
      const old = p.music[0];
      const id = uid("music");
      const D = projectDuration(p);
      const source =
        asset.kind === "music"
          ? ({ kind: "bundled", mood: asset.mood, file: asset.file, title: asset.title } as const)
          : ({ kind: "custom", name: asset.name } as const);
      const item = {
        id,
        start: old ? old.start : 0,
        end: old ? old.end : D,
        source,
        volume: old?.volume ?? 0.12,
        fadeIn: old?.fadeIn ?? 0.5,
        fadeOut: old?.fadeOut ?? 1.5,
        ducking: old?.ducking ?? true,
      };
      return { project: { ...p, music: [item] }, ref: { track: "music", id } };
    }
    case "zoom": {
      const id = uid("zoom");
      const span = place(p, at, asset.style === "slow" ? 3 : 1.4);
      return {
        project: {
          ...p,
          zooms: [
            ...p.zooms,
            { id, ...span, scale: asset.style === "slow" ? 1.08 : 1.2, style: asset.style, shake: Boolean(asset.shake) },
          ],
        },
        ref: { track: "zooms", id },
      };
    }
    case "transition": {
      const id = uid("tr");
      const D = projectDuration(p);
      const atClamped = Math.max(0, Math.min(D - 0.2, at));
      return {
        project: { ...p, transitions: [...p.transitions, { id, at: Math.round(atClamped * 1000) / 1000, kind: "flash" }] },
        ref: { track: "transitions", id },
      };
    }
  }
}

export function updateSettings(p: Project, patch: Partial<ProjectSettings>): Project {
  return { ...p, settings: { ...p.settings, ...patch } };
}

export function setCaptions(p: Project, patch: Partial<Pick<Project["captions"], "enabled" | "style">>): Project {
  return { ...p, captions: { ...p.captions, ...patch } };
}
