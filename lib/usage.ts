import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PresetId, UsageStatus } from "@/types";
import { anonDailyLimit } from "@/lib/supabase";

const DAY_MS = 24 * 60 * 60 * 1000;

export type LimitCheck =
  | { ok: true; usedToday: number; limit: number }
  | { ok: false; resetsAt: string; limit: number };

/** Counts this visitor's videos in the last 24 hours. */
export async function checkDailyLimit(
  db: SupabaseClient,
  ipHash: string,
): Promise<LimitCheck> {
  const limit = anonDailyLimit();
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const { data, count, error } = await db
    .from("usage_logs")
    .select("created_at", { count: "exact" })
    .is("user_id", null)
    .eq("ip_hash", ipHash)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw error;

  const used = count ?? 0;
  if (used < limit) return { ok: true, usedToday: used, limit };
  // Rolling window: a slot frees up 24h after the oldest video in it.
  const oldest = data?.[0]?.created_at as string | undefined;
  const resetsAt = new Date(
    (oldest ? Date.parse(oldest) : Date.now()) + DAY_MS,
  ).toISOString();
  return { ok: false, resetsAt, limit };
}

export async function createUsageLog(
  db: SupabaseClient,
  row: { ipHash: string; durationSec: number; preset: PresetId },
): Promise<number> {
  const { data, error } = await db
    .from("usage_logs")
    .insert({
      ip_hash: row.ipHash,
      duration_sec: row.durationSec,
      preset: row.preset,
      status: "started",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as number;
}

/**
 * Confirms a usage log exists, belongs to this visitor and was created in the
 * last 24 hours, so the AI routes can't be called without a session.
 */
export async function findUsageLog(
  db: SupabaseClient,
  usageId: number,
  ipHash: string,
): Promise<{ id: number; status: UsageStatus } | null> {
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const { data, error } = await db
    .from("usage_logs")
    .select("id, status")
    .eq("id", usageId)
    .eq("ip_hash", ipHash)
    .gte("created_at", since)
    .maybeSingle();
  if (error) throw error;
  return data as { id: number; status: UsageStatus } | null;
}

/** Moves a usage log forward; never moves a finished log back. */
export async function setUsageStatus(
  db: SupabaseClient,
  usageId: number,
  status: UsageStatus,
  errorCode?: string,
) {
  const from: UsageStatus[] =
    status === "transcribed"
      ? ["started"]
      : status === "planned"
        ? ["started", "transcribed"]
        : ["started", "transcribed", "planned"];
  const { error } = await db
    .from("usage_logs")
    .update({ status, error_code: errorCode ?? null })
    .eq("id", usageId)
    .in("status", from);
  if (error) throw error;
}
