import type { EDL, TimeRange } from "@/types";
import { SILENCE } from "@/lib/limits";
import { mergeRanges, subtractRanges } from "./cuts";

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Builds the edit list: everything in the source that isn't cut. */
export function buildEDL(
  sourceDuration: number,
  cuts: TimeRange[],
  minSegment: number = SILENCE.minSegment,
): EDL {
  const segments = subtractRanges(
    [{ start: 0, end: sourceDuration }],
    mergeRanges(cuts),
  )
    .filter((s) => s.end - s.start >= minSegment)
    .map((s) => ({ start: round(s.start), end: round(s.end) }));

  const outputDuration = round(
    segments.reduce((sum, s) => sum + (s.end - s.start), 0),
  );
  return { sourceDuration, segments, outputDuration };
}

/**
 * Maps a time on the original timeline to the cut timeline:
 * new time = original time − total length of cuts before it.
 * Returns null when the time falls inside a removed part.
 */
export function toOutputTime(edl: EDL, t: number): number | null {
  let elapsed = 0;
  for (const s of edl.segments) {
    if (t < s.start) return null;
    if (t <= s.end) return round(elapsed + (t - s.start));
    elapsed += s.end - s.start;
  }
  return null;
}

/** Total seconds removed by the edit. */
export function removedSeconds(edl: EDL): number {
  return round(edl.sourceDuration - edl.outputDuration);
}

/**
 * Maps a range to the cut timeline. The start must be inside a kept segment;
 * the end is clipped to the end of that segment. Returns null otherwise.
 */
export function toOutputRange(edl: EDL, start: number, end: number): TimeRange | null {
  let elapsed = 0;
  for (const s of edl.segments) {
    if (start < s.start) return null;
    if (start <= s.end) {
      const outStart = elapsed + (start - s.start);
      const outEnd = elapsed + (Math.min(end, s.end) - s.start);
      return outEnd > outStart ? { start: round(outStart), end: round(outEnd) } : null;
    }
    elapsed += s.end - s.start;
  }
  return null;
}

/** Re-times words to the cut timeline; words that were cut are dropped. */
export function retimeWords<T extends TimeRange>(edl: EDL, words: T[]): T[] {
  const out: T[] = [];
  for (const w of words) {
    const r = toOutputRange(edl, w.start, w.end);
    if (r) out.push({ ...w, start: r.start, end: r.end });
  }
  return out;
}

/** Output-timeline times where one kept segment ends and the next begins, with how much was removed there. */
export function cutPoints(edl: EDL): { at: number; removed: number }[] {
  const points: { at: number; removed: number }[] = [];
  let elapsed = 0;
  edl.segments.forEach((s, i) => {
    if (i > 0) points.push({ at: round(elapsed), removed: round(s.start - edl.segments[i - 1].end) });
    elapsed += s.end - s.start;
  });
  return points;
}
