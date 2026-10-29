import type { TimeRange, Word } from "@/types";
import { SILENCE } from "@/lib/limits";

export interface SilenceOptions {
  /** Gaps longer than this (seconds) are cut. */
  threshold?: number;
  /** Kept on each side of a cut (seconds). */
  padding?: number;
}

/** Sorts ranges and merges any that overlap or touch. */
export function mergeRanges(ranges: TimeRange[]): TimeRange[] {
  const sorted = ranges
    .filter((r) => r.end > r.start)
    .map((r) => ({ ...r }))
    .sort((a, b) => a.start - b.start);
  const out: TimeRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      out.push(r);
    }
  }
  return out;
}

/** Removes every range in `remove` from `from`. Both may be unsorted. */
export function subtractRanges(
  from: TimeRange[],
  remove: TimeRange[],
): TimeRange[] {
  const holes = mergeRanges(remove);
  const out: TimeRange[] = [];
  for (const r of mergeRanges(from)) {
    let cursor = r.start;
    for (const h of holes) {
      if (h.end <= cursor || h.start >= r.end) continue;
      if (h.start > cursor) out.push({ start: cursor, end: h.start });
      cursor = Math.max(cursor, h.end);
      if (cursor >= r.end) break;
    }
    if (cursor < r.end) out.push({ start: cursor, end: r.end });
  }
  return out;
}

/**
 * Turns a silent gap into the part that should be removed, keeping `padding`
 * next to speech. Gaps touching the start or end of the video are cut all the
 * way to the edge.
 */
function gapToCut(
  gap: TimeRange,
  duration: number,
  padding: number,
): TimeRange | null {
  const start = gap.start <= 0 ? 0 : gap.start + padding;
  const end = gap.end >= duration ? duration : gap.end - padding;
  return end - start > 0.01 ? { start, end } : null;
}

/**
 * Finds the parts of the video to remove because nobody is speaking, based on
 * gaps between transcribed words.
 */
export function findSilenceCuts(
  words: Word[],
  duration: number,
  opts: SilenceOptions = {},
): TimeRange[] {
  const threshold = opts.threshold ?? SILENCE.defaultThreshold;
  const padding = opts.padding ?? SILENCE.padding;
  if (words.length === 0 || duration <= 0) return [];

  const speech = mergeRanges(
    words.map((w) => ({
      start: Math.max(0, w.start),
      end: Math.min(duration, w.end),
    })),
  );

  const gaps: TimeRange[] = [];
  let cursor = 0;
  for (const s of speech) {
    gaps.push({ start: cursor, end: s.start });
    cursor = s.end;
  }
  gaps.push({ start: cursor, end: duration });

  return gaps
    .filter((g) => g.end - g.start > threshold)
    .map((g) => gapToCut(g, duration, padding))
    .filter((c): c is TimeRange => c !== null);
}

/**
 * Second check: silences reported by ffmpeg's silencedetect. Parts that
 * overlap a transcribed word are never cut; what's left is cut (with padding)
 * when it is still longer than the threshold.
 */
export function findDetectedSilenceCuts(
  silences: TimeRange[],
  words: Word[],
  duration: number,
  opts: SilenceOptions = {},
): TimeRange[] {
  const threshold = opts.threshold ?? SILENCE.defaultThreshold;
  const padding = opts.padding ?? SILENCE.padding;
  const speech = words.map((w) => ({ start: w.start, end: w.end }));
  return subtractRanges(silences, speech)
    .filter((g) => g.end - g.start > threshold)
    .map((g) => gapToCut(g, duration, padding))
    .filter((c): c is TimeRange => c !== null);
}

/** Parses `silence_start` / `silence_end` lines from ffmpeg's log output. */
export function parseSilenceDetect(
  log: string[],
  duration: number,
): TimeRange[] {
  const out: TimeRange[] = [];
  let open: number | null = null;
  for (const line of log) {
    const start = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (start) {
      open = Math.max(0, parseFloat(start[1]));
      continue;
    }
    const end = /silence_end:\s*([\d.]+)/.exec(line);
    if (end && open !== null) {
      out.push({ start: open, end: parseFloat(end[1]) });
      open = null;
    }
  }
  // Silence that runs to the end of the file has no silence_end line.
  if (open !== null && duration > open) out.push({ start: open, end: duration });
  return out;
}

const ALWAYS_FILLERS = new Set([
  "um", "umm", "ummm", "uh", "uhh", "uhm", "erm", "hmm", "hm", "mm", "mhm",
  "ah", "ahh", "eh", "ehh", "ano", "parang",
]);

/** Lowercase with punctuation removed, for matching. */
export function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
}

const endsSentence = (w: Word | undefined) => !w || /[.?!]$/.test(w.word.trim());

/**
 * Finds filler words to cut. Context-dependent fillers:
 * - "like" only when standalone (a pause or comma on both sides)
 * - "you know" as a pair
 * - "kasi" only at the start of a sentence
 */
export function findFillerCuts(words: Word[]): TimeRange[] {
  const gapBefore = (i: number) => (i === 0 ? Infinity : words[i].start - words[i - 1].end);
  const gapAfter = (i: number) =>
    i === words.length - 1 ? Infinity : words[i + 1].start - words[i].end;
  const cutWord = (from: number, to: number): TimeRange => {
    // Reach a little into the surrounding pauses so no tail of the word is left.
    const before = Math.min(0.05, Math.max(0, gapBefore(from)) / 2);
    const after = Math.min(0.05, Math.max(0, gapAfter(to)) / 2);
    return { start: words[from].start - before, end: words[to].end + after };
  };

  const cuts: TimeRange[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = normalizeWord(words[i].word);
    const next = words[i + 1] ? normalizeWord(words[i + 1].word) : "";
    if (ALWAYS_FILLERS.has(w)) {
      cuts.push(cutWord(i, i));
    } else if (w === "like") {
      const pausedBefore = gapBefore(i) >= 0.15 || /,$/.test(words[i - 1]?.word ?? ",");
      const pausedAfter = gapAfter(i) >= 0.15 || /,$/.test(words[i].word);
      if (pausedBefore && pausedAfter) cuts.push(cutWord(i, i));
    } else if (w === "you" && next === "know") {
      const pausedAfter = gapAfter(i + 1) >= 0.15 || /[,.]$/.test(words[i + 1].word);
      if (pausedAfter) {
        cuts.push(cutWord(i, i + 1));
        i++;
      }
    } else if (w === "kasi") {
      if (gapBefore(i) >= 0.4 || endsSentence(words[i - 1])) cuts.push(cutWord(i, i));
    }
  }
  return cuts;
}

export interface CutOptions extends SilenceOptions {
  removeFillers?: boolean;
  /** A filler isn't cut if that would leave a kept piece shorter than this. */
  minFillerSegment?: number;
}

/**
 * All cuts for an edit: word gaps, the silencedetect check and (optionally)
 * filler words.
 */
export function findCuts(
  words: Word[],
  silences: TimeRange[],
  duration: number,
  opts: CutOptions = {},
): TimeRange[] {
  const base = [
    ...findSilenceCuts(words, duration, opts),
    ...findDetectedSilenceCuts(silences, words, duration, opts),
  ];
  if (!opts.removeFillers) return mergeRanges(base);

  const minSeg = opts.minFillerSegment ?? 0.3;
  const fillers = findFillerCuts(words);
  const all = mergeRanges([...base, ...fillers]);
  const kept = subtractRanges([{ start: 0, end: duration }], all);
  // Drop filler cuts that would leave a tiny island of speech next to them.
  const tooShort = kept.filter((k) => k.end - k.start < minSeg);
  const safeFillers = fillers.filter(
    (f) =>
      !tooShort.some(
        (k) => Math.abs(k.end - f.start) < 0.02 || Math.abs(k.start - f.end) < 0.02 ||
          (k.start >= f.start - 0.02 && k.end <= f.end + 0.02),
      ),
  );
  return mergeRanges([...base, ...safeFillers]);
}
