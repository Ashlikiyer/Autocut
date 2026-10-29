import { z } from "zod";
import {
  MOMENT_TYPES,
  type Effect,
  type Moment,
  type MomentType,
  type PresetId,
  type SfxName,
  type TimeRange,
  type Word,
} from "@/types";
import { ALLOWED_EMOJI, PRESETS } from "@/lib/presets";

/**
 * The AI director marks *moments* (a punchline, a reveal, a big number…), not
 * effects. Each moment type has a fixed recipe, the way an editor would treat
 * it, so effects follow what's happening in the video instead of a quota.
 */

const emojiSet = new Set(ALLOWED_EMOJI);
const bare = (e: string) => e.replace(/️/g, "").trim();
const allowedBare = new Map(ALLOWED_EMOJI.map((e) => [bare(e), e]));

export function allowedEmoji(e: string | undefined): string | undefined {
  if (!e) return undefined;
  return emojiSet.has(e) ? e : allowedBare.get(bare(e));
}

const rawMomentSchema = z.object({
  type: z.enum(MOMENT_TYPES),
  start: z.number().finite().nonnegative(),
  end: z.number().finite().nonnegative().optional(),
  text: z.string().optional().catch(undefined),
  emoji: z.string().optional().catch(undefined),
  emphasis: z.array(z.string()).optional().catch(undefined),
  label: z.string().optional().catch(undefined),
});

export interface NormalizedMoments {
  moments: Moment[];
  /** Spans of key words to highlight in captions. */
  emphasis: TimeRange[];
}

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** Cleans wording: max `words` words / `chars` characters (text pops: 4 / 28). */
export function cleanText(text: string | undefined, words = 4, chars = 28): string | undefined {
  const t = text?.replace(/\s+/g, " ").trim().split(" ").slice(0, words).join(" ").slice(0, chars).trim();
  return t || undefined;
}

/** How long each card stays on screen (seconds). */
const CARD_SECONDS = { pill: 3, step: 3.2, focus: 2.2 } as const;

/**
 * Validates moments and snaps them to the spoken words they cover, so an
 * effect can never land on silence. Moments without speech are dropped.
 */
export function normalizeMoments(
  raw: unknown,
  words: Word[],
  duration: number,
): NormalizedMoments {
  const list = Array.isArray(raw) ? raw : [];
  const moments: Moment[] = [];
  const emphasis: TimeRange[] = [];

  for (const item of list) {
    const r = rawMomentSchema.safeParse(item);
    if (!r.success) continue;
    const m = r.data;
    if (m.start >= duration) continue;
    const end = Math.min(duration, Math.max(m.end ?? m.start + 1, m.start + 0.3));
    // Words inside the moment; if the AI's times fall in a gap, the nearest word within 0.4 s.
    let covered = words.filter((w) => w.end > m.start && w.start < end);
    if (!covered.length) {
      const near = words.filter((w) => Math.abs(w.start - m.start) <= 0.4);
      covered = near.length ? [near[0]] : [];
    }
    if (!covered.length) continue;
    const start = covered[0].start;
    const isCard = m.type === "pill" || m.type === "step" || m.type === "focus";
    // Cards stay up for a fixed time, so a viewer can read them.
    const snappedEnd = isCard
      ? start + CARD_SECONDS[m.type as keyof typeof CARD_SECONDS]
      : Math.max(covered[covered.length - 1].end, start + 0.5);
    const text =
      m.type === "pill" ? cleanText(m.text, 6, 34) : m.type === "focus" ? cleanText(m.text, 3, 22) : cleanText(m.text);
    // Cards without wording are useless; drop them.
    if (isCard && !text) continue;
    const label = m.type === "step" ? cleanText(m.label, 2, 12) : undefined;

    moments.push({
      type: m.type,
      start,
      end: Math.min(duration, snappedEnd),
      ...(text ? { text } : {}),
      ...(label ? { label } : {}),
      ...(allowedEmoji(m.emoji) ? { emoji: allowedEmoji(m.emoji) } : {}),
    });

    const keys = new Set((m.emphasis ?? []).slice(0, 3).map(norm).filter(Boolean));
    for (const w of covered) {
      if (keys.has(norm(w.word))) emphasis.push({ start: w.start, end: w.end });
    }
  }

  moments.sort((a, b) => a.start - b.start);
  // One moment at a time. When two overlap, a specific moment (a number, a
  // punchline…) beats a generic key point; otherwise the earlier one wins.
  const deduped: Moment[] = [];
  for (const m of moments) {
    const prev = deduped[deduped.length - 1];
    if (prev && m.start < prev.end) {
      if (prev.type === "key_point" && m.type !== "key_point") deduped[deduped.length - 1] = m;
      continue;
    }
    deduped.push(m);
  }
  return { moments: deduped, emphasis };
}

/** Most moments per minute for each style (normal intensity); a ceiling, not a target. */
export const MOMENT_MAX_PER_MINUTE: Record<PresetId, number> = {
  energetic: 6,
  clean: 3,
  funny: 6,
  podcast: 2,
  creator: 6,
};

/**
 * Keeps at most `max` moments at least `gap` seconds apart. Specific moments
 * (punchlines, numbers…) are kept before generic key points.
 */
export function limitMoments(moments: Moment[], max: number, gap = 2.5): Moment[] {
  const rank = (m: Moment) => (m.type === "key_point" ? 1 : 0);
  const byPriority = [...moments].sort((a, b) => rank(a) - rank(b) || a.start - b.start);
  const kept: Moment[] = [];
  for (const m of byPriority) {
    if (kept.length >= max) break;
    if (kept.every((k) => Math.abs(k.start - m.start) >= gap)) kept.push(m);
  }
  return kept.sort((a, b) => a.start - b.start);
}

/** Sound effects that suit each preset for each kind of moment. */
function sound(preset: PresetId, type: MomentType, i: number): SfxName | undefined {
  const funny = preset === "funny";
  switch (type) {
    case "punchline":
      return funny ? (i % 2 ? "scratch" : "boom") : "boom";
    case "reveal":
      return "whoosh2";
    case "number":
      return "ding";
    case "list_item":
      return preset === "clean" ? "click" : "pop";
    case "question":
      return "swoosh-up";
    case "reaction":
      return funny ? "pop" : "pop";
    case "call_to_action":
      return "ding";
    case "pill":
      return "click";
    case "step":
      return "whoosh";
    case "focus":
      return "whoosh2";
    default:
      return undefined;
  }
}

/**
 * Turns moments into effects with the recipe for each type. The composer
 * later drops any effect type the user (or AI) didn't switch on.
 */
export function momentsToEffects(moments: Moment[], preset: PresetId): Effect[] {
  const p = PRESETS[preset];
  const out: Effect[] = [];
  // In the card-based Creator style, list items become numbered STEP cards and
  // numbers become context pills instead of floating text.
  const cardStyle = preset === "creator";
  let step = 0;
  moments.forEach((m, i) => {
    if (cardStyle && m.type === "list_item" && m.text) {
      m = { ...m, type: "step", label: m.label ?? `STEP ${++step}`, end: m.start + 3.2 };
    } else if (cardStyle && m.type === "number" && m.text) {
      m = { ...m, type: "pill", end: m.start + 3 };
    } else if (m.type === "step" && !m.label) {
      m = { ...m, label: `STEP ${++step}` };
    }
    const sfx = sound(preset, m.type, i);
    const at = m.start;
    const punch = (scale: number, max: number, shake = false): Effect => ({
      type: "zoom",
      start: at,
      end: Math.min(m.end, at + max),
      scale,
      style: "punch",
      shake,
    });
    const text = (style: "bounce" | "pop" | "shake", fallback?: string) => {
      const t = m.text ?? fallback;
      if (t) out.push({ type: "text", at, text: t, style });
    };

    switch (m.type) {
      case "key_point":
        out.push(punch(p.zoomScale, 1.8));
        break;
      case "punchline":
        out.push(punch(Math.max(1.22, p.zoomScale), 1.4, true));
        if (m.emoji) out.push({ type: "emoji", at, emoji: m.emoji });
        break;
      case "reveal":
        out.push(punch(Math.max(1.18, p.zoomScale), 1.6));
        text("pop");
        break;
      case "number":
        text("bounce");
        break;
      case "list_item":
        text("pop");
        break;
      case "question":
        text("shake");
        break;
      case "emotional":
        // A slow push-in over the line; no sound, no text.
        out.push({ type: "zoom", start: at, end: Math.min(m.end, at + 5), scale: 1.08, style: "slow" });
        break;
      case "reaction":
        if (m.emoji) out.push({ type: "emoji", at, emoji: m.emoji });
        break;
      case "call_to_action":
        if (cardStyle) {
          out.push({ type: "card", kind: "pill", at, end: at + 3, text: m.text ?? "FOLLOW FOR MORE" });
        } else {
          text("bounce");
          out.push({ type: "emoji", at: at + 0.2, emoji: m.emoji ?? "👇" });
        }
        break;
      case "pill":
      case "step":
      case "focus":
        out.push({
          type: "card",
          kind: m.type,
          at,
          end: m.end,
          text: m.text!,
          ...(m.label ? { label: m.label } : {}),
        });
        break;
    }
    if (sfx) out.push({ type: "sfx", at: Math.max(0, at - 0.05), sound: sfx });
  });
  return out;
}
