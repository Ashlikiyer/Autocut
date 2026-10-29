import { apiError, readJson } from "@/lib/api";
import { sessionRequestSchema, sessionUpdateSchema } from "@/lib/schemas";
import {
  anonDailyLimit,
  clientIp,
  getSupabaseAdmin,
  hashIp,
  supabaseOptional,
} from "@/lib/supabase";
import {
  checkDailyLimit,
  createUsageLog,
  findUsageLog,
  setUsageStatus,
} from "@/lib/usage";
import type { SessionResponse } from "@/types";

/** Checks the daily limit and creates a usage log for a new video. */
export async function POST(request: Request) {
  const parsed = sessionRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError(400, "BAD_REQUEST", { message: "Invalid session request" });
  }

  const db = getSupabaseAdmin();
  if (!db) {
    if (!supabaseOptional()) return apiError(502, "UPSTREAM_ERROR");
    // Local development without Supabase: no limits, no logging.
    return Response.json({
      usageId: 0,
      remainingToday: anonDailyLimit(),
    } satisfies SessionResponse);
  }

  try {
    const ipHash = hashIp(clientIp(request));
    const limit = await checkDailyLimit(db, ipHash);
    if (!limit.ok) {
      return apiError(429, "DAILY_LIMIT", {
        resetsAt: limit.resetsAt,
        message: `You've used all ${limit.limit} free videos for today.`,
      });
    }
    const usageId = await createUsageLog(db, {
      ipHash,
      durationSec: parsed.data.durationSec,
      preset: parsed.data.preset,
    });
    return Response.json({
      usageId,
      remainingToday: Math.max(0, limit.limit - limit.usedToday - 1),
    } satisfies SessionResponse);
  } catch (err) {
    console.error("[session] failed", err);
    return apiError(502, "UPSTREAM_ERROR");
  }
}

/** Records how the in-browser render ended (rendered or failed). */
export async function PATCH(request: Request) {
  const parsed = sessionUpdateSchema.safeParse(await readJson(request));
  if (!parsed.success) return apiError(400, "BAD_REQUEST");

  const db = getSupabaseAdmin();
  const { usageId, status, errorCode } = parsed.data;
  if (!db || usageId === 0) return Response.json({ ok: true });

  try {
    const log = await findUsageLog(db, usageId, hashIp(clientIp(request)));
    if (!log) return apiError(400, "BAD_REQUEST", { message: "Unknown session" });
    await setUsageStatus(db, usageId, status, errorCode);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[session] update failed", err);
    return apiError(502, "UPSTREAM_ERROR");
  }
}
