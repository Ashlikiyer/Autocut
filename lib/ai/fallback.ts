import type { EffectsPlan, PresetId, Word } from "@/types";
import { PRESETS } from "@/lib/presets";
import { effectCaps, normalizePlan, type PlanOptions } from "@/lib/plan";

/** Splits words into sentences on pauses and end punctuation. */
export function sentences(words: Word[], maxWords = 15): Word[][] {
  const out: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    const prev = cur[cur.length - 1];
    if (prev && (w.start - prev.end > 0.5 || /[.?!]$/.test(prev.word) || cur.length >= maxWords)) {
      out.push(cur);
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) out.push(cur);
  return out;
}

const LIST_WORDS = new Set([
  "first", "second", "third", "fourth", "fifth", "step", "una", "pangalawa", "pangatlo", "pang-apat",
]);

/**
 * Rule-based plan used when the AI director is unavailable or returns bad
 * JSON. It finds simple moments the same way the AI would (the longest line of
 * each section, numbers, list words) and lets the moment recipes pick effects.
 */
export function fallbackPlan(
  words: Word[],
  preset: PresetId,
  duration: number,
  opts: PlanOptions = {},
): EffectsPlan {
  const p = PRESETS[preset];
  const caps = effectCaps(preset, opts);
  const moments: unknown[] = [];

  if (caps.zooms > 0) {
    const window = Math.max(p.zoomGap, 60 / caps.zooms);
    const all = sentences(words);
    for (let t = 0; t < duration; t += window) {
      const inWindow = all.filter((s) => s[0].start >= t && s[0].start < t + window && s.length >= 4);
      if (!inWindow.length) continue;
      const longest = inWindow.reduce((a, b) =>
        b[b.length - 1].end - b[0].start > a[a.length - 1].end - a[0].start ? b : a,
      );
      moments.push({ type: "key_point", start: longest[0].start, end: longest[longest.length - 1].end });
    }
  }

  words.forEach((w, i) => {
    const clean = w.word.replace(/[^\p{L}\p{N}₱$%,.-]/gu, "");
    if (/\d/.test(clean)) {
      const next = words[i + 1]?.word.replace(/[^\p{L}\p{N}]/gu, "") ?? "";
      moments.push({ type: "number", start: w.start, end: w.end, text: `${clean} ${next}`.toUpperCase(), emphasis: [w.word] });
    } else if (LIST_WORDS.has(clean.toLowerCase())) {
      moments.push({ type: "list_item", start: w.start, end: w.end, text: clean.toUpperCase(), emphasis: [w.word] });
    }
  });

  return normalizePlan(
    { hook: "", music: { mood: p.defaultMusic, volume: p.musicVolume }, effects: [], moments },
    preset,
    duration,
    { ...opts, words },
  );
}
