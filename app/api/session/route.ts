import { apiError, readJson } from "@/lib/api";
import { sessionRequestSchema, sessionUpdateSchema } from "@/lib/schemas";
import {
  anonDailyLimit,
  getSupabaseAdmin,
  identifyVisitor,
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
    // Counted per browser (visitor cookie), with a looser cap per IP.
    const who = identifyVisitor(request, true);
    const headers: HeadersInit = who.setCookie ? { "Set-Cookie": who.setCookie } : {};
    const limit = await checkDailyLimit(db, who);
    if (!limit.ok) {
      return apiError(
        429,
        "DAILY_LIMIT",
        {
          resetsAt: limit.resetsAt,
          message:
            limit.reason === "ip"
              ? "Too many free videos were made from this internet connection today."
              : `You've used all ${limit.limit} free videos for today.`,
        },
        headers,
      );
    }
    const usageId = await createUsageLog(db, {
      who,
      durationSec: parsed.data.durationSec,
      preset: parsed.data.preset,
    });
    return Response.json(
      { usageId, remainingToday: limit.remainingAfter } satisfies SessionResponse,
      { headers },
    );
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
    const log = await findUsageLog(db, usageId, identifyVisitor(request));
    if (!log) return apiError(400, "BAD_REQUEST", { message: "Unknown session" });
    await setUsageStatus(db, usageId, status, errorCode);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[session] update failed", err);
    return apiError(502, "UPSTREAM_ERROR");
  }
}
