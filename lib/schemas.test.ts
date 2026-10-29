import { describe, expect, it } from "vitest";
import {
  feedbackSchema,
  sessionRequestSchema,
  sessionUpdateSchema,
  transcribeFieldsSchema,
} from "./schemas";

describe("sessionRequestSchema", () => {
  it("accepts a valid request", () => {
    expect(sessionRequestSchema.safeParse({ durationSec: 184.2, preset: "energetic" }).success).toBe(true);
  });

  it("rejects unknown fields, bad presets and over-long videos", () => {
    expect(sessionRequestSchema.safeParse({ durationSec: 10, preset: "clean", extra: 1 }).success).toBe(false);
    expect(sessionRequestSchema.safeParse({ durationSec: 10, preset: "wild" }).success).toBe(false);
    expect(sessionRequestSchema.safeParse({ durationSec: 16 * 60, preset: "clean" }).success).toBe(false);
  });
});

describe("sessionUpdateSchema", () => {
  it("only allows final statuses and safe error codes", () => {
    expect(sessionUpdateSchema.safeParse({ usageId: 1, status: "rendered" }).success).toBe(true);
    expect(sessionUpdateSchema.safeParse({ usageId: 1, status: "planned" }).success).toBe(false);
    expect(
      sessionUpdateSchema.safeParse({ usageId: 1, status: "failed", errorCode: "<script>" }).success,
    ).toBe(false);
  });
});

describe("transcribeFieldsSchema", () => {
  it("coerces form strings", () => {
    const r = transcribeFieldsSchema.parse({ usageId: "12", chunkIndex: "0", offsetSec: "300.5" });
    expect(r).toEqual({ usageId: 12, chunkIndex: 0, offsetSec: 300.5 });
  });

  it("rejects unsupported languages", () => {
    expect(
      transcribeFieldsSchema.safeParse({ usageId: "1", chunkIndex: "0", offsetSec: "0", language: "fr" }).success,
    ).toBe(false);
  });
});

describe("feedbackSchema", () => {
  it("validates rating range and comment length", () => {
    expect(feedbackSchema.safeParse({ usageId: 1, rating: 5, comment: "Great" }).success).toBe(true);
    expect(feedbackSchema.safeParse({ usageId: 1, rating: 6 }).success).toBe(false);
    expect(feedbackSchema.safeParse({ usageId: 1, rating: 3, comment: "x".repeat(1001) }).success).toBe(false);
  });
});
