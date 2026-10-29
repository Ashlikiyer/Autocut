import { apiError, readJson } from "@/lib/api";
import { feedbackSchema } from "@/lib/schemas";
import {
  getSupabaseAdmin,
  identifyVisitor,
  supabaseOptional,
} from "@/lib/supabase";
import { findUsageLog } from "@/lib/usage";

/** Saves a 1–5 rating and optional comment for a processed video. */
export async function POST(request: Request) {
  const parsed = feedbackSchema.safeParse(await readJson(request));
  if (!parsed.success) return apiError(400, "BAD_REQUEST");

  const db = getSupabaseAdmin();
  if (!db) {
    if (!supabaseOptional()) return apiError(502, "UPSTREAM_ERROR");
    return Response.json({ ok: true });
  }

  const { usageId, rating, comment } = parsed.data;
  try {
    const log = await findUsageLog(db, usageId, identifyVisitor(request));
    if (!log) return apiError(400, "BAD_REQUEST", { message: "Unknown session" });

    const { error } = await db
      .from("feedback")
      .insert({ usage_id: usageId, rating, comment: comment || null });
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[feedback] failed", err);
    return apiError(502, "UPSTREAM_ERROR");
  }
}
