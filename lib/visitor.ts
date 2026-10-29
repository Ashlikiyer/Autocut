/**
 * Anonymous visitor identity for the free daily limit.
 *
 * The 3 free videos a day are counted per browser, using a random ID in an
 * HttpOnly cookie, so people who share an internet connection (family Wi-Fi,
 * school, office, mobile carriers that put many customers behind one IP) don't
 * use up each other's videos. A looser per-IP cap stops someone getting
 * unlimited videos by clearing cookies. Only salted hashes are stored.
 *
 * Pure helpers here; the database side is in lib/usage.ts.
 */

export const VISITOR_COOKIE = "ac_vid";
/** One year. */
const MAX_AGE = 365 * 24 * 60 * 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The visitor ID from a Cookie header, if it's one we issued (a UUID). */
export function readVisitorId(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === VISITOR_COOKIE) {
      const value = decodeURIComponent(rest.join("="));
      return UUID.test(value) ? value.toLowerCase() : null;
    }
  }
  return null;
}

export function visitorCookie(id: string, secure: boolean): string {
  return [
    `${VISITOR_COOKIE}=${id}`,
    "Path=/",
    `Max-Age=${MAX_AGE}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export interface LimitInput {
  /** Videos this browser started in the last 24 h. */
  visitorUsed: number;
  /** Videos from this IP in the last 24 h (all browsers). */
  ipUsed: number;
  visitorLimit: number;
  ipLimit: number;
  /** created_at of the oldest counted video, for "resets at". */
  oldestVisitor?: string;
  oldestIp?: string;
}

export type LimitDecision =
  | { ok: true; remainingAfter: number; limit: number }
  | { ok: false; reason: "visitor" | "ip"; resetsAt: string; limit: number };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Rolling 24 h window: a slot frees up 24 h after the oldest video in it. */
function resetAt(oldest: string | undefined, now: number) {
  return new Date((oldest ? Date.parse(oldest) : now) + DAY_MS).toISOString();
}

export function decideLimit(i: LimitInput, now = Date.now()): LimitDecision {
  if (i.visitorUsed >= i.visitorLimit) {
    return { ok: false, reason: "visitor", resetsAt: resetAt(i.oldestVisitor, now), limit: i.visitorLimit };
  }
  if (i.ipUsed >= i.ipLimit) {
    return { ok: false, reason: "ip", resetsAt: resetAt(i.oldestIp, now), limit: i.visitorLimit };
  }
  return {
    ok: true,
    // What this browser has left after the video being started now.
    remainingAfter: Math.max(0, Math.min(i.visitorLimit - i.visitorUsed, i.ipLimit - i.ipUsed) - 1),
    limit: i.visitorLimit,
  };
}
