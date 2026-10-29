import { z } from "zod";
import {
  EFFECT_KINDS,
  PRESET_IDS,
  MUSIC_MOODS,
  SFX_NAMES,
  type AutoDecisions,
  type Pacing,
  type Effect,
  type EffectIntensity,
  type EffectKind,
  type EffectsPlan,
  type PresetId,
  type Word,
} from "@/types";
import { ALLOWED_EMOJI, INTENSITY_SCALE, MIN_CAPS, PRESETS } from "@/lib/presets";
import {
  limitMoments,
  MOMENT_MAX_PER_MINUTE,
  momentsToEffects,
  normalizeMoments,
} from "@/lib/moments";

export interface PlanOptions {
  /** Effects the user selected; defaults to the preset's. */
  effects?: EffectKind[];
  intensity?: EffectIntensity;
  /** Transcript, used to snap the AI's moments to spoken words. */
  words?: Word[];
}

export interface EffectCaps {
  zooms: number;
  emoji: number;
  text: number;
  sfx: number;
}

/**
 * Max effects per minute for this preset, selection and intensity. An effect
 * the user turned on is never capped at zero, even if the preset doesn't use it.
 */
export function effectCaps(preset: PresetId, opts: PlanOptions = {}): EffectCaps {
  const p = PRESETS[preset];
  const on = new Set(opts.effects ?? p.defaultEffects);
  const k = INTENSITY_SCALE[opts.intensity ?? "normal"];
  const cap = (enabled: boolean, presetMax: number, floor: number) =>
    enabled ? Math.max(presetMax, floor) * k : 0;
  return {
    zooms: cap(on.has("zoom") || on.has("shake"), p.caps.zooms[1], MIN_CAPS.zooms),
    emoji: cap(on.has("emoji"), p.caps.emoji[1], MIN_CAPS.emoji),
    text: cap(on.has("text"), p.caps.text[1], MIN_CAPS.text),
    sfx: cap(on.has("sfx"), p.caps.sfx[1], MIN_CAPS.sfx),
  };
}

const time = z.number().finite().nonnegative();

const effectSchemas = {
  zoom: z.object({
    type: z.literal("zoom"),
    start: time,
    end: time,
    scale: z.number().optional(),
    style: z.enum(["punch", "slow"]).optional().catch(undefined),
    shake: z.boolean().optional().catch(undefined),
  }),
  emoji: z.object({
    type: z.literal("emoji"),
    at: time,
    emoji: z.string(),
    sfx: z.enum(SFX_NAMES).optional().catch(undefined),
  }),
  text: z.object({
    type: z.literal("text"),
    at: time,
    text: z.string(),
    style: z.enum(["bounce", "pop", "shake"]).catch("bounce"),
  }),
  sfx: z.object({ type: z.literal("sfx"), at: time, sound: z.enum(SFX_NAMES) }),
  card: z.object({
    type: z.literal("card"),
    kind: z.enum(["pill", "step", "focus"]),
    at: time,
    end: time,
    text: z.string().min(1).max(40),
    label: z.string().max(14).optional(),
  }),
};

/** Loose shape of what the LLM returns; individual effects are checked one by one. */
export const rawPlanSchema = z.object({
  hook: z.string().catch(""),
  hookAccent: z.string().optional().catch(undefined),
  hookSticker: z.string().optional().catch(undefined),
  music: z
    .object({
      mood: z.enum(MUSIC_MOODS).catch("none"),
      volume: z.number().catch(0.15),
    })
    .catch({ mood: "none", volume: 0.15 }),
  effects: z.array(z.unknown()).catch([]),
  moments: z.array(z.unknown()).catch([]),
  emphasis: z
    .array(z.object({ start: time, end: time }))
    .catch([]),
});

/** Strict shape of a validated plan (used for API responses and tests). */
export const effectsPlanSchema = z.object({
  hook: z.string().max(60),
  music: z.object({ mood: z.enum(MUSIC_MOODS), volume: z.number().min(0).max(0.3) }),
  effects: z.array(
    z.discriminatedUnion("type", [
      effectSchemas.zoom.extend({ scale: z.number() }),
      effectSchemas.emoji,
      effectSchemas.text,
      effectSchemas.sfx,
      effectSchemas.card,
    ]),
  ),
});

const emojiSet = new Set(ALLOWED_EMOJI);

/** Strips variation selectors so "❤" matches "❤️". */
const bareEmoji = (e: string) => e.replace(/️/g, "").trim();
const allowedBare = new Map(ALLOWED_EMOJI.map((e) => [bareEmoji(e), e]));

function effectTime(e: Effect) {
  return e.type === "zoom" ? e.start : e.at;
}

/** Keeps at most `max` items, spread evenly across the list. */
function thin<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  if (max <= 0) return [];
  const out: T[] = [];
  const step = items.length / max;
  for (let i = 0; i < max; i++) out.push(items[Math.floor(i * step)]);
  return out;
}

/** Drops items closer than `gap` seconds to the previous kept one. */
function space<T>(items: T[], at: (t: T) => number, gap: number): T[] {
  const out: T[] = [];
  for (const it of items) {
    const prev = out[out.length - 1];
    if (!prev || at(it) - at(prev) >= gap) out.push(it);
  }
  return out;
}

/**
 * Treats a plan as untrusted: drops effects with unknown types, bad times,
 * unknown sounds or emoji, trims text, and caps counts per minute by preset.
 */
export function normalizePlan(
  raw: unknown,
  preset: PresetId,
  duration: number,
  opts: PlanOptions = {},
): EffectsPlan {
  const p = PRESETS[preset];
  const caps = effectCaps(preset, opts);
  const result = rawPlanSchema.safeParse(raw);
  const parsed = result.success ? result.data : rawPlanSchema.parse({});
  const minutes = Math.max(duration / 60, 0.25);
  // A selected effect always gets at least one, even on very short clips.
  const cap = (max: number) => (max > 0 ? Math.max(1, Math.round(max * minutes)) : 0);
  const inRange = (t: number) => t >= 0 && t < duration;

  const zooms: Effect[] = [];
  const emoji: Effect[] = [];
  const texts: Effect[] = [];
  const sfx: Effect[] = [];
  const cards: Effect[] = [];

  // Moments (from the AI) become effects through the recipe for each type.
  const found = opts.words
    ? normalizeMoments(parsed.moments, opts.words, duration)
    : { moments: [], emphasis: [] };
  // Keep or drop whole moments (so a sound never outlives its visual).
  const momentMax = Math.max(
    1,
    Math.round(MOMENT_MAX_PER_MINUTE[preset] * INTENSITY_SCALE[opts.intensity ?? "normal"] * minutes),
  );
  found.moments = limitMoments(found.moments, momentMax);
  const derived = momentsToEffects(found.moments, preset);
  const items: unknown[] = [...parsed.effects, ...derived];
  // Effects that come from moments are already limited by the moment budget;
  // only effects the plan listed directly go through the per-type caps.
  const fromMoment = new Set<unknown>(derived);
  const momentFx: Effect[] = [];

  for (const item of items) {
    const type = (item as { type?: unknown })?.type;
    if (typeof type !== "string" || !(type in effectSchemas)) continue;
    const r = effectSchemas[type as keyof typeof effectSchemas].safeParse(item);
    if (!r.success) continue;
    const e = r.data;
    switch (e.type) {
      case "zoom": {
        const start = e.start;
        const end = Math.min(e.end, duration, start + 3);
        if (!inRange(start) || end - start < 0.6) break;
        const slow = e.style === "slow";
        const end2 = slow ? Math.min(e.end, duration, start + 5) : end;
        const scale = Math.min(1.4, Math.max(slow ? 1.03 : 1.05, e.scale ?? p.zoomScale));
        zooms.push({
          type: "zoom",
          start,
          end: end2,
          scale,
          ...(e.style ? { style: e.style } : {}),
          ...(e.shake ? { shake: true } : {}),
        });
        break;
      }
      case "emoji": {
        const known = emojiSet.has(e.emoji) ? e.emoji : allowedBare.get(bareEmoji(e.emoji));
        if (!known || !inRange(e.at)) break;
        (fromMoment.has(item) ? momentFx : emoji).push({
          type: "emoji",
          at: e.at,
          emoji: known,
          ...(e.sfx ? { sfx: e.sfx } : {}),
        });
        break;
      }
      case "text": {
        const text = e.text.replace(/\s+/g, " ").trim().split(" ").slice(0, 4).join(" ").slice(0, 28);
        if (!text || !inRange(e.at)) break;
        (fromMoment.has(item) ? momentFx : texts).push({ type: "text", at: e.at, text, style: e.style });
        break;
      }
      case "card": {
        if (!inRange(e.at)) break;
        const card: Effect = {
          type: "card",
          kind: e.kind,
          at: e.at,
          end: Math.min(duration, Math.max(e.end, e.at + 1)),
          text: e.text,
          ...(e.label ? { label: e.label } : {}),
        };
        (fromMoment.has(item) ? momentFx : cards).push(card);
        break;
      }
      case "sfx":
        if (inRange(e.at)) (fromMoment.has(item) ? momentFx : sfx).push({ type: "sfx", at: e.at, sound: e.sound });
        break;
    }
  }

  const byTime = (a: Effect, b: Effect) => effectTime(a) - effectTime(b);
  zooms.sort(byTime);
  // Zooms only on real moments: no overlaps, and punch zooms keep a minimum
  // gap (shorter at higher intensity) so they never feel like spam.
  const gap = p.zoomGap / INTENSITY_SCALE[opts.intensity ?? "normal"];
  const zoomsClean: Effect[] = [];
  let lastPunch = -Infinity;
  for (const z of zooms) {
    if (z.type !== "zoom") continue;
    const prev = zoomsClean[zoomsClean.length - 1];
    if (prev && prev.type === "zoom" && z.start < prev.end + 0.5) continue;
    const isPunch = z.style !== "slow";
    if (isPunch && z.start - lastPunch < gap) continue;
    if (isPunch) lastPunch = z.start;
    zoomsClean.push(z);
  }

  const effects = [
    ...thin(zoomsClean, cap(caps.zooms)),
    ...thin(space(emoji.sort(byTime), effectTime, 2), cap(caps.emoji)),
    ...thin(space(texts.sort(byTime), effectTime, 3), cap(caps.text)),
    ...thin(space(sfx.sort(byTime), effectTime, 0.5), cap(caps.sfx)),
    ...space(cards.sort(byTime), effectTime, 3),
    ...momentFx,
  ].sort(byTime);

  const hook = parsed.hook.replace(/\s+/g, " ").trim().split(" ").slice(0, 6).join(" ").slice(0, 48);

  const accent = parsed.hookAccent?.replace(/\s+/g, " ").trim().slice(0, 24);
  const sticker = parsed.hookSticker?.replace(/\s+/g, " ").trim().split(" ").slice(0, 4).join(" ").slice(0, 28);
  return {
    hook,
    ...(accent && hook.toLowerCase().includes(accent.toLowerCase()) ? { hookAccent: accent } : {}),
    ...(sticker ? { hookSticker: sticker } : {}),
    music: {
      mood: parsed.music.mood,
      volume: Math.min(0.3, Math.max(0.05, parsed.music.volume)),
    },
    effects,
    ...(found.moments.length ? { moments: found.moments } : {}),
    ...(found.emphasis.length || parsed.emphasis.length
      ? { emphasis: [...parsed.emphasis, ...found.emphasis].slice(0, 200) }
      : {}),
  };
}

/** Silence threshold (seconds) for each pacing choice. */
export const PACING_THRESHOLD: Record<Pacing, number> = {
  tight: 0.35,
  balanced: 0.5,
  relaxed: 0.8,
};

const presetId = z.enum(PRESET_IDS);

const decisionsSchema = z.object({
  style: presetId.catch("energetic"),
  captionStyle: presetId.optional().catch(undefined),
  effects: z.array(z.unknown()).catch([]),
  intensity: z.enum(["less", "normal", "more"]).catch("normal"),
  pacing: z.enum(["tight", "balanced", "relaxed"]).catch("balanced"),
  removeFillers: z.boolean().catch(true),
  reason: z.string().catch(""),
});

/** Validates the AI's edit choices; anything unknown falls back to a safe default. */
export function normalizeDecisions(raw: unknown): AutoDecisions {
  const r = decisionsSchema.safeParse(raw);
  const d = r.success ? r.data : decisionsSchema.parse({});
  const known = new Set<string>(EFFECT_KINDS);
  const chosen = new Set(d.effects.filter((e): e is EffectKind => typeof e === "string" && known.has(e)));
  return {
    preset: d.style,
    captionStyle: d.captionStyle ?? d.style,
    // Stable order; an empty choice falls back to the style's defaults.
    effects: chosen.size
      ? EFFECT_KINDS.filter((k) => chosen.has(k))
      : PRESETS[d.style].defaultEffects,
    intensity: d.intensity,
    pacing: d.pacing,
    removeFillers: d.removeFillers,
    reason: d.reason.replace(/\s+/g, " ").trim().slice(0, 240),
  };
}
