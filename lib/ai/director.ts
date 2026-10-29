import "server-only";
import type {
  AutoDecisions,
  Effect,
  EffectsPlan,
  Moment,
  PresetId,
  TimeRange,
  VideoAnalysis,
  VideoStats,
  Word,
} from "@/types";
import { normalizeDecisions, normalizePlan, type PlanOptions } from "@/lib/plan";
import { getGroq, RateLimitedError, withRateLimitRetry } from "./groq";
import { autoSystemPrompt, systemPrompt, transcriptLines } from "./prompts";
import { analyzeSnapshots } from "./vision";

/** Models tried in order. Override the first with GROQ_PLAN_MODEL. */
function planModels(): string[] {
  const preferred = process.env.GROQ_PLAN_MODEL;
  const defaults = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
  return preferred ? [preferred, ...defaults.filter((m) => m !== preferred)] : defaults;
}

/** Transcripts longer than this are planned in windows, then merged. */
const WINDOW_WORDS = 4000;

export class BadPlanError extends Error {}

async function askModel(model: string, preset: PresetId, words: Word[], duration: number, opts: PlanOptions) {
  const groq = getGroq();
  const res = await withRateLimitRetry(() =>
    groq.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt(preset, duration, opts) },
        { role: "user", content: `Transcript:\n${transcriptLines(words)}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_completion_tokens: 4096,
      reasoning_effort: "low",
    }),
  );
  const content = res.choices[0]?.message?.content;
  if (!content) throw new BadPlanError("Empty response");
  return JSON.parse(content) as unknown;
}

/** Asks the LLM for a plan; tries twice (falling back to a smaller model) before giving up. */
async function planWindow(preset: PresetId, words: Word[], duration: number, opts: PlanOptions): Promise<unknown> {
  const models = planModels();
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const model = models[Math.min(attempt, models.length - 1)];
    try {
      return await askModel(model, preset, words, duration, opts);
    } catch (err) {
      // Rate limits are reported as such so the route can return RATE_LIMITED.
      if (err instanceof RateLimitedError) throw err;
      lastErr = err;
      console.warn(`[plan] attempt ${attempt + 1} with ${model} failed`, err);
    }
  }
  throw new BadPlanError(String(lastErr));
}

/** Builds a validated effects plan for the whole transcript. */
export async function planEdit(
  preset: PresetId,
  words: Word[],
  duration: number,
  opts: PlanOptions = {},
): Promise<EffectsPlan> {
  const withWords = { ...opts, words };
  if (words.length <= WINDOW_WORDS) {
    return normalizePlan(await planWindow(preset, words, duration, opts), preset, duration, withWords);
  }
  const effects: Effect[] = [];
  const moments: Moment[] = [];
  const emphasis: TimeRange[] = [];
  let hook = "";
  let music: EffectsPlan["music"] = { mood: "none", volume: 0.15 };
  for (let i = 0; i < words.length; i += WINDOW_WORDS) {
    const win = words.slice(i, i + WINDOW_WORDS);
    const raw = await planWindow(preset, win, duration, opts);
    const part = normalizePlan(raw, preset, duration, { ...opts, words: win });
    if (i === 0) {
      hook = part.hook;
      music = part.music;
    }
    effects.push(...part.effects);
    moments.push(...(part.moments ?? []));
    emphasis.push(...(part.emphasis ?? []));
  }
  // Merge the windows' effects (already derived from their moments) and re-apply caps.
  const merged = normalizePlan({ hook, music, effects, emphasis }, preset, duration, opts);
  return { ...merged, moments };
}

export interface AutoEditResult {
  plan: EffectsPlan;
  decisions: AutoDecisions;
  analysis: VideoAnalysis | null;
}

/**
 * Auto mode: looks at the snapshots (if shared), then lets the director pick
 * the style, effects, amount and pacing and place every effect.
 */
export async function autoEdit(
  words: Word[],
  duration: number,
  stats: VideoStats | undefined,
  snapshots: { at: number; times?: number[]; image: string }[],
): Promise<AutoEditResult> {
  const transcriptStart = words.slice(0, 120).map((w) => w.word).join(" ");
  const analysis = await analyzeSnapshots(snapshots, transcriptStart);

  // Decide on the first window; longer transcripts are then planned in windows.
  const first = words.slice(0, WINDOW_WORDS);
  const models = planModels();
  let raw: unknown = null;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2 && raw === null; attempt++) {
    const model = models[Math.min(attempt, models.length - 1)];
    try {
      const res = await withRateLimitRetry(() =>
        getGroq().chat.completions.create({
          model,
          messages: [
            { role: "system", content: autoSystemPrompt(duration, stats, analysis) },
            { role: "user", content: `Transcript:\n${transcriptLines(first)}` },
          ],
          response_format: { type: "json_object" },
          temperature: 0.4,
          max_completion_tokens: 5000,
          reasoning_effort: "medium",
        }),
      );
      const content = res.choices[0]?.message?.content;
      if (!content) throw new BadPlanError("Empty response");
      raw = JSON.parse(content);
    } catch (err) {
      if (err instanceof RateLimitedError) throw err;
      lastErr = err;
      console.warn(`[auto] attempt ${attempt + 1} with ${model} failed`, err);
    }
  }
  if (raw === null) throw new BadPlanError(String(lastErr));

  const decisions = normalizeDecisions((raw as { decisions?: unknown }).decisions);
  const opts = { effects: decisions.effects, intensity: decisions.intensity };
  const plan =
    words.length > WINDOW_WORDS
      ? await planEdit(decisions.preset, words, duration, opts)
      : normalizePlan(raw, decisions.preset, duration, { ...opts, words });
  return { plan, decisions, analysis };
}
