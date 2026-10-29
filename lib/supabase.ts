import "server-only";
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { LIMITS } from "@/lib/limits";

let admin: SupabaseClient | null = null;

/**
 * Service-role client for API routes. Bypasses RLS, so it must never be
 * imported from client code (guarded by "server-only").
 *
 * Returns null when Supabase isn't configured. That's allowed in local
 * development so the editor can be tried before the database exists; in
 * production the routes treat it as an upstream error.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  admin ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

export const supabaseOptional = () => process.env.NODE_ENV !== "production";

/** Client IP from the proxy headers set by Vercel. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** SHA-256 of IP + salt. The raw IP is never stored. */
export function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT;
  if (!salt && process.env.NODE_ENV === "production") {
    throw new Error("IP_HASH_SALT is not set");
  }
  return createHash("sha256")
    .update(`${ip}:${salt ?? "dev-salt"}`)
    .digest("hex");
}

export function anonDailyLimit(): number {
  const n = Number(process.env.ANON_DAILY_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : LIMITS.defaultAnonDailyLimit;
}
