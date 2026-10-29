import type { Word } from "@/types";
import { captionEnd } from "@/lib/engine/ass";
import type { CompCard, Composition, EmojiPop } from "@/lib/engine/compose";
import { cutZoomRanges } from "@/lib/engine/filtergraph";

/**
 * Pure timing math for the editor preview. Each function mirrors what the
 * ffmpeg export does at output time `t`, so the preview matches the file.
 */

const between = (t: number, a: number, b: number) => t >= a && t <= b;

/** Zoom factor at `t`: jump-cut zoom + punch/slow zooms (as in filtergraph.ts). */
export function zoomAt(comp: Composition, t: number): number {
  let z = 1;
  for (const r of cutZoomRanges(comp)) if (t >= r.start && t < r.end) z += 0.1;
  for (const zm of comp.zooms) {
    if (!between(t, zm.start, zm.end)) continue;
    const ramp =
      zm.style === "slow"
        ? Math.min((t - zm.start) / Math.max(0.5, zm.end - zm.start), (zm.end - t) / 0.3)
        : Math.min((t - zm.start) / 0.12, (zm.end - t) / 0.2);
    z += (zm.scale - 1) * Math.min(1, Math.max(0, ramp));
  }
  return z;
}

/** Camera-shake offset at `t` as a fraction of the frame's shorter side. */
export function shakeAt(comp: Composition, t: number): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const z of comp.zooms) {
    if (!z.shake || !between(t, z.start, z.start + 0.45)) continue;
    x += 0.012 * Math.sin(t * 70);
    y += 0.012 * Math.sin(t * 53);
  }
  return { x, y };
}

/** White flash strength (0–0.55) at `t` for transitions. */
export function flashAt(comp: Composition, t: number): number {
  let a = 0;
  for (const c of comp.flashes) if (between(t, c, c + 0.2)) a += 0.55 * (1 - (t - c) / 0.2);
  return Math.min(1, a);
}

/** True while a focus title blurs the video. */
export function focusAt(comp: Composition, t: number): boolean {
  return comp.cards.some((c) => c.kind === "focus" && between(t, c.start, c.end));
}

export type Entrance = "none" | "fade" | "slide" | "pop" | "bounce";

/**
 * Entrance animation `local` seconds into an item lasting `dur` seconds,
 * matching the export's card overlay (filtergraph.ts). dy is a fraction of
 * the frame height.
 */
export function entranceAt(anim: Entrance, dropDown: boolean, local: number, dur: number) {
  if (anim === "none") return { opacity: 1, dy: 0 };
  const fadeIn = Math.min(1, local / (anim === "pop" || anim === "bounce" ? 0.1 : 0.18));
  const fadeOut = Math.min(1, Math.max(0, (dur - local) / 0.2));
  const dy =
    anim === "slide"
      ? (dropDown ? -1 : 1) * 0.02 * Math.max(0, 1 - local / 0.2)
      : anim === "pop"
        ? 0.03 * Math.exp(-local * 14) * Math.cos(local * 22)
        : anim === "bounce"
          ? -0.06 * Math.exp(-local * 8) * Math.abs(Math.cos(local * 14))
          : 0;
  return { opacity: Math.min(fadeIn, fadeOut), dy };
}

/** Card state at `t`, matching the export's overlay (default entrance: slide). */
export function cardStateAt(card: CompCard, t: number): { visible: boolean; opacity: number; dy: number } {
  if (t < card.start || t > card.end) return { visible: false, opacity: 0, dy: 0 };
  const dur = Math.max(0.4, card.end - card.start);
  return { visible: true, ...entranceAt(card.animation ?? "slide", card.kind === "pill", t - card.start, dur) };
}

/** Sticker state at `t`: it rises 5% of the height into place over 0.15 s. */
export function stickerStateAt(e: EmojiPop, t: number): { visible: boolean; dy: number } {
  if (t < e.start || t > e.end) return { visible: false, dy: 0 };
  return { visible: true, dy: 0.05 * Math.max(0, 1 - (t - e.start) / 0.15) };
}

/**
 * The caption group on screen at `t` and which word is being spoken, using
 * the same grouping and end times as the subtitle export.
 */
export function captionAt(
  groups: Word[][],
  t: number,
  hidden: { start: number; end: number }[] = [],
): { words: Word[]; active: number } | null {
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (!g.length) continue;
    const end = captionEnd(g, groups[i + 1]?.[0]?.start);
    if (t < g[0].start || t >= end) continue;
    if (hidden.some((h) => t >= h.start && t < h.end)) return null;
    let active = 0;
    for (let k = 0; k < g.length; k++) if (t >= g[k].start) active = k;
    return { words: g, active };
  }
  return null;
}

/** Ranges where someone is speaking (for music ducking), merged with padding. */
export function speechRanges(words: Word[], pad = 0.25): { start: number; end: number }[] {
  const sorted = [...words].sort((a, b) => a.start - b.start);
  const out: { start: number; end: number }[] = [];
  for (const w of sorted) {
    const s = Math.max(0, w.start - pad);
    const e = w.end + pad;
    const last = out[out.length - 1];
    if (last && s <= last.end) last.end = Math.max(last.end, e);
    else out.push({ start: s, end: e });
  }
  return out;
}

/** Music level at `t` (before ducking): fades in and out over its span. */
export function musicGainAt(
  m: { start: number; end: number; volume: number; fadeIn: number; fadeOut: number },
  t: number,
): number {
  if (t < m.start || t > m.end) return 0;
  const fin = m.fadeIn > 0 ? Math.min(1, (t - m.start) / m.fadeIn) : 1;
  const fout = m.fadeOut > 0 ? Math.min(1, (m.end - t) / m.fadeOut) : 1;
  return m.volume * Math.max(0, Math.min(fin, fout));
}

/** How much ducking lowers the music while someone talks. */
export const DUCK_LEVEL = 0.3;

export function formatTimecode(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}
