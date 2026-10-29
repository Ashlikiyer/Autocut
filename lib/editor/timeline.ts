/**
 * Pure helpers for the timeline UI (pixels ↔ time, ruler ticks, virtualisation).
 */

/** Tick spacings (seconds) the ruler can use. */
const STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120];

/** Smallest tick step that keeps labels at least `minPx` apart. */
export function tickStep(pxPerSecond: number, minPx = 70): number {
  return STEPS.find((s) => s * pxPerSecond >= minPx) ?? STEPS[STEPS.length - 1];
}

/** Ticks (seconds) between `from` and `to`, aligned to the step. */
export function ticks(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  const first = Math.max(0, Math.floor(from / step) * step);
  for (let t = first; t <= to + 1e-9; t += step) out.push(Math.round(t * 1000) / 1000);
  return out;
}

/** Ruler label: "0:05", "1:30", or "0:05.5" for sub-second steps. */
export function tickLabel(t: number, step: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  const sec = step < 1 ? s.toFixed(step < 0.5 ? 2 : 1).padStart(step < 0.5 ? 5 : 4, "0") : String(Math.round(s)).padStart(2, "0");
  return `${m}:${sec}`;
}

/** Time range visible in the scroller, with a margin so items appear before they scroll in. */
export function visibleRange(scrollLeft: number, width: number, pxPerSecond: number, marginPx = 300) {
  return {
    from: Math.max(0, (scrollLeft - marginPx) / pxPerSecond),
    to: (scrollLeft + width + marginPx) / pxPerSecond,
  };
}

/** Whether a span overlaps the visible range. */
export function inRange(start: number, end: number, range: { from: number; to: number }): boolean {
  return end >= range.from && start <= range.to;
}

/** Zoom that fits `duration` into `width` pixels. */
export function fitZoom(duration: number, width: number, min = 10, max = 400): number {
  if (duration <= 0 || width <= 0) return 60;
  return Math.max(min, Math.min(max, (width - 40) / duration));
}

/** New scroll position that keeps time `anchor` under the same screen x after zooming. */
export function scrollForZoom(anchor: number, anchorScreenX: number, newPxPerSecond: number): number {
  return Math.max(0, anchor * newPxPerSecond - anchorScreenX);
}

/**
 * Downsamples audio into peaks (max |amplitude|) per bucket, for waveforms.
 * `perSecond` buckets per second of audio.
 */
export function computePeaks(samples: Float32Array, sampleRate: number, perSecond = 100): Float32Array {
  const size = Math.max(1, Math.floor(sampleRate / perSecond));
  const out = new Float32Array(Math.ceil(samples.length / size));
  for (let b = 0; b < out.length; b++) {
    let max = 0;
    const end = Math.min(samples.length, (b + 1) * size);
    for (let i = b * size; i < end; i++) {
      const v = Math.abs(samples[i]);
      if (v > max) max = v;
    }
    out[b] = max;
  }
  return out;
}
