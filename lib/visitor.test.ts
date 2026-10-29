import { describe, expect, it } from "vitest";
import { decideLimit, readVisitorId, visitorCookie, VISITOR_COOKIE } from "./visitor";

const ID = "3f2b8c1e-9d4a-4b7e-8f10-2a6c5d9e7b01";

describe("visitor cookie", () => {
  it("reads our ID from a Cookie header", () => {
    expect(readVisitorId(`theme=dark; ${VISITOR_COOKIE}=${ID}; other=1`)).toBe(ID);
  });

  it("ignores missing, foreign or tampered values", () => {
    expect(readVisitorId(null)).toBeNull();
    expect(readVisitorId("theme=dark")).toBeNull();
    expect(readVisitorId(`${VISITOR_COOKIE}=not-a-uuid`)).toBeNull();
    expect(readVisitorId(`${VISITOR_COOKIE}=${ID}'; drop table`)).toBeNull();
  });

  it("is HttpOnly, Lax and only Secure in production", () => {
    expect(visitorCookie(ID, true)).toBe(`${VISITOR_COOKIE}=${ID}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax; Secure`);
    expect(visitorCookie(ID, false)).not.toContain("Secure");
  });
});

describe("decideLimit", () => {
  const base = { visitorLimit: 3, ipLimit: 30 };
  const now = Date.parse("2026-10-29T12:00:00Z");

  it("counts per browser, so people on one Wi-Fi don't block each other", () => {
    // Someone else on this IP used 3 already; this browser used none.
    expect(decideLimit({ ...base, visitorUsed: 0, ipUsed: 3 }, now)).toEqual({ ok: true, remainingAfter: 2, limit: 3 });
  });

  it("stops a browser after its 3 videos, resetting 24 h after the oldest", () => {
    const d = decideLimit({ ...base, visitorUsed: 3, ipUsed: 3, oldestVisitor: "2026-10-29T08:00:00Z" }, now);
    expect(d).toEqual({ ok: false, reason: "visitor", resetsAt: "2026-10-30T08:00:00.000Z", limit: 3 });
  });

  it("still caps a whole IP, so clearing cookies doesn't give unlimited videos", () => {
    const d = decideLimit({ ...base, visitorUsed: 0, ipUsed: 30, oldestIp: "2026-10-29T01:00:00Z" }, now);
    expect(d).toMatchObject({ ok: false, reason: "ip", resetsAt: "2026-10-30T01:00:00.000Z" });
  });

  it("reports what's left, never below zero", () => {
    expect(decideLimit({ ...base, visitorUsed: 2, ipUsed: 5 }, now)).toMatchObject({ ok: true, remainingAfter: 0 });
    expect(decideLimit({ ...base, visitorUsed: 0, ipUsed: 29 }, now)).toMatchObject({ ok: true, remainingAfter: 0 });
  });
});
