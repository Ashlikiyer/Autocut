import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PresetId, UsageStatus } from "@/types";
import { anonDailyLimit, anonIpDailyLimit, type Visitor } from "@/lib/supabase";
import { decideLimit, type LimitDecision } from "@/lib/visitor";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * True when the database doesn't have the visitor_hash column yet (migration
 * 003 not run). The limit then falls back to counting per IP only.
 */
function missingVisitorColumn(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === "42703" || error.code === "PGRST204" || /visitor_hash/.test(error.message ?? ""));
}

let warned = false;
function warnMissingColumn() {
  if (warned) return;
  warned = true;
  console.warn("[usage] usage_logs.visitor_hash is missing: run supabase/migrations/003_visitor_limit.sql. Counting per IP only.");
}

/** Anonymous videos for one column value in the last 24 h, and the oldest one's time. */
async function countRecent(db: SupabaseClient, column: "ip_hash" | "visitor_hash", value: string) {
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const { data, count, error } = await db
    .from("usage_logs")
    .select("created_at", { count: "exact" })
    .is("user_id", null)
    .eq(column, value)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(1);
  return { used: count ?? 0, oldest: data?.[0]?.created_at as string | undefined, error };
}

/**
 * The free daily limit: 3 videos per browser, plus a looser cap per IP so
 * clearing cookies doesn't give unlimited videos.
 */
export async function checkDailyLimit(db: SupabaseClient, who: Visitor): Promise<LimitDecision> {
  const ip = await countRecent(db, "ip_hash", who.ipHash);
  if (ip.error) throw ip.error;

  let visitor = { used: 0, oldest: undefined as string | undefined };
  if (who.visitorHash) {
    const v = await countRecent(db, "visitor_hash", who.visitorHash);
    if (missingVisitorColumn(v.error)) {
      warnMissingColumn();
      // Old behaviour: everyone on this IP shares the per-browser limit.
      visitor = { used: ip.used, oldest: ip.oldest };
    } else if (v.error) {
      throw v.error;
    } else {
      visitor = v;
    }
  }

  return decideLimit({
    visitorUsed: visitor.used,
    ipUsed: ip.used,
    visitorLimit: anonDailyLimit(),
    ipLimit: anonIpDailyLimit(),
    oldestVisitor: visitor.oldest,
    oldestIp: ip.oldest,
  });
}

export async function createUsageLog(
  db: SupabaseClient,
  row: { who: Visitor; durationSec: number; preset: PresetId },
): Promise<number> {
  const base = {
    ip_hash: row.who.ipHash,
    duration_sec: row.durationSec,
    preset: row.preset,
    status: "started",
  };
  const insert = (values: Record<string, unknown>) => db.from("usage_logs").insert(values).select("id").single();
  let { data, error } = await insert({ ...base, visitor_hash: row.who.visitorHash });
  if (missingVisitorColumn(error)) {
    warnMissingColumn();
    ({ data, error } = await insert(base));
  }
  if (error) throw error;
  return data!.id as number;
}

/**
 * Confirms a usage log exists, belongs to this visitor (same browser, or same
 * IP if cookies are blocked) and was created in the last 24 hours, so the AI
 * routes can't be called without a session.
 */
export async function findUsageLog(
  db: SupabaseClient,
  usageId: number,
  who: Visitor,
): Promise<{ id: number; status: UsageStatus } | null> {
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const query = (owner: string) =>
    db.from("usage_logs").select("id, status").eq("id", usageId).or(owner).gte("created_at", since).maybeSingle();
  // Hashes are hex, so they're safe inside the filter string.
  const byIp = `ip_hash.eq.${who.ipHash}`;
  let { data, error } = await query(who.visitorHash ? `visitor_hash.eq.${who.visitorHash},${byIp}` : byIp);
  if (who.visitorHash && missingVisitorColumn(error)) {
    warnMissingColumn();
    ({ data, error } = await query(byIp));
  }
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
