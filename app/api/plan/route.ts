import { apiError, readJson } from "@/lib/api";
import { autoEdit, BadPlanError, planEdit } from "@/lib/ai/director";
import { RateLimitedError } from "@/lib/ai/groq";
import { planRequestSchema } from "@/lib/schemas";
import {
  clientIp,
  getSupabaseAdmin,
  hashIp,
  supabaseOptional,
} from "@/lib/supabase";
import { findUsageLog, setUsageStatus } from "@/lib/usage";

/** Sends the transcript to the LLM "director" and returns a validated effects plan. */
export async function POST(request: Request) {
  const parsed = planRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return apiError(400, "BAD_REQUEST");
  const { usageId, preset, duration, transcript, effects, intensity, auto, stats, snapshots } = parsed.data;

  const db = getSupabaseAdmin();
  if (db) {
    try {
      const log = await findUsageLog(db, usageId, hashIp(clientIp(request)));
      // Re-planning after a render is allowed (the user changed style or effects).
      if (!log) return apiError(400, "BAD_REQUEST", { message: "Invalid session" });
    } catch (err) {
      console.error("[plan] session lookup failed", err);
      return apiError(502, "UPSTREAM_ERROR");
    }
  } else if (!supabaseOptional()) {
    return apiError(502, "UPSTREAM_ERROR");
  }

  try {
    const body = auto
      ? await (async () => {
          const r = await autoEdit(transcript.words, duration, stats, snapshots ?? []);
          return { ...r.plan, decisions: r.decisions, analysis: r.analysis };
        })()
      : await planEdit(preset, transcript.words, duration, { effects, intensity });
    if (db) {
      await setUsageStatus(db, usageId, "planned").catch((err) =>
        console.error("[plan] status update failed", err),
      );
    }
    return Response.json(body);
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return apiError(429, "RATE_LIMITED", { retryAfter: err.retryAfter }, {
        "Retry-After": String(err.retryAfter),
      });
    }
    if (err instanceof BadPlanError) return apiError(502, "BAD_PLAN");
    console.error("[plan] failed", err);
    return apiError(502, "UPSTREAM_ERROR");
  }
}
