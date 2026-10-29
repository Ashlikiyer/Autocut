import type { Composition } from "@/lib/engine/compose";

/**
 * Client for the optional HyperFrames overlay server (render-server/). It is
 * sent only the cards' text and timings, never the video. When the server
 * isn't configured or fails, AutoCut falls back to cards drawn in the browser.
 */

export interface CardOverlay {
  webm: Uint8Array;
  /** Where each card sits in the WebM, same order as composition.cards. */
  segments: { offset: number; duration: number }[];
  /** Size the overlay was rendered at (the final output size). */
  width: number;
  height: number;
  renderSeconds: number;
}

export function overlayServerUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_OVERLAY_URL?.trim();
  return url ? url.replace(/\/+$/, "") : null;
}

/** Identifies a set of cards at a size, so a rendered overlay can be reused. */
export function overlayKey(comp: Composition, width: number, height: number): string {
  return JSON.stringify({
    width,
    height,
    theme: comp.theme,
    cards: comp.cards.map((c) => [c.kind, c.text, c.label, c.accent, c.sticker, c.style, +(c.end - c.start).toFixed(2)]),
  });
}

/**
 * Whether HyperFrames can draw these cards. Plain editor text and cards the
 * user moved are drawn in the browser instead, so they land where the editor
 * preview shows them.
 */
export function overlaySupports(comp: Composition): boolean {
  return (
    comp.cards.length > 0 &&
    comp.cards.every((c) => c.kind !== "text" && c.x === undefined && c.y === undefined)
  );
}

/** The last overlay rendered, reused when the same cards are asked for again. */
let last: { key: string; overlay: CardOverlay } | null = null;

export async function requestCardOverlay(
  comp: Composition,
  width: number,
  height: number,
  fps: number,
  signal?: AbortSignal,
): Promise<CardOverlay> {
  const base = overlayServerUrl();
  if (!base) throw new Error("Overlay server not configured");
  if (!overlaySupports(comp)) throw new Error("These cards are drawn in the browser");
  const key = overlayKey(comp, width, height);
  if (last?.key === key) return last.overlay;
  const res = await fetch(`${base}/cards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: signal ?? AbortSignal.timeout(180_000),
    body: JSON.stringify({
      width,
      height,
      fps,
      theme: comp.theme,
      cards: comp.cards.map((c) => ({
        kind: c.kind,
        text: c.text.slice(0, 60),
        ...(c.label ? { label: c.label.slice(0, 14) } : {}),
        ...(c.accent ? { accent: c.accent.slice(0, 24) } : {}),
        ...(c.sticker ? { sticker: c.sticker.slice(0, 28) } : {}),
        ...(c.style ? { style: c.style } : {}),
        duration: Math.min(6, Math.max(0.5, +(c.end - c.start).toFixed(2))),
      })),
    }),
  });
  if (!res.ok) throw new Error(`Overlay server returned ${res.status}`);
  const segments = JSON.parse(res.headers.get("X-Overlay-Segments") ?? "[]") as CardOverlay["segments"];
  if (segments.length !== comp.cards.length) throw new Error("Overlay segments don't match the cards");
  const overlay: CardOverlay = {
    webm: new Uint8Array(await res.arrayBuffer()),
    segments,
    width,
    height,
    renderSeconds: Number(res.headers.get("X-Render-Seconds") ?? 0),
  };
  last = { key, overlay };
  return overlay;
}
