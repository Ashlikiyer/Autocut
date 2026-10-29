import type { Project } from "./project";

/**
 * Small project for tests: a 30 s source with three clips
 *   clip a: source 0–5   → output 0–5
 *   clip b: source 8–14  → output 5–11
 *   clip c: source 20–26 → output 11–17
 */
export function testProject(): Project {
  return {
    version: 1,
    info: { duration: 30, width: 1080, height: 1920, fps: 30, hasAudio: true },
    clips: [
      { id: "a", sourceIn: 0, sourceOut: 5 },
      { id: "b", sourceIn: 8, sourceOut: 14 },
      { id: "c", sourceIn: 20, sourceOut: 26 },
    ],
    texts: [
      {
        id: "t1", start: 6, end: 8, text: "Hello", variant: "plain", font: "Poppins Black",
        size: 0.08, color: "#FFFFFF", x: 0.5, y: 0.45, animation: "fade",
      },
    ],
    captions: {
      enabled: true,
      style: "energetic",
      groups: [
        { id: "g1", start: 1, end: 2, words: [{ text: "one", start: 1, end: 1.4 }, { text: "two", start: 1.5, end: 2 }] },
        { id: "g2", start: 12, end: 13, words: [{ text: "three", start: 12, end: 13 }] },
      ],
    },
    stickers: [{ id: "s1", start: 12, end: 14, emoji: "🔥", x: 0.5, y: 0.32, size: 0.2 }],
    sfx: [{ id: "x1", start: 6.5, duration: 0.2, sound: "pop", volume: 1 }],
    music: [
      {
        id: "m1", start: 0, end: 17, source: { kind: "bundled", mood: "chill" },
        volume: 0.1, fadeIn: 0.5, fadeOut: 1.5, ducking: true,
      },
    ],
    zooms: [{ id: "z1", start: 2, end: 3, scale: 1.2, style: "punch", shake: false }],
    transitions: [{ id: "tr1", at: 11, kind: "flash" }],
    settings: {
      preset: "energetic", vertical: true, cutZoom: false, colorBoost: false, vignette: false,
      progressBar: false, theme: { panel: "#111418", accent: "#C8FF2E", text: "#FFFFFF" }, sfxVolume: 0.5,
    },
  };
}
