import { describe, expect, it } from "vitest";
import { normalizeDecisions, PACING_THRESHOLD } from "./plan";
import { autoSystemPrompt } from "./ai/prompts";
import { planRequestSchema } from "./schemas";
import { snapshotTimes } from "./engine/frames";
import { videoStats } from "./client";
import { PRESETS } from "./presets";

describe("normalizeDecisions", () => {
  it("keeps valid choices and drops unknown effects", () => {
    const d = normalizeDecisions({
      style: "funny",
      effects: ["zoom", "lasers", "emoji", 5, "sfx"],
      intensity: "more",
      pacing: "tight",
      removeFillers: false,
      reason: "  It's a   comedy skit, so it needs punchlines.  ",
    });
    expect(d).toEqual({
      preset: "funny",
      captionStyle: "funny",
      effects: ["zoom", "emoji", "sfx"],
      intensity: "more",
      pacing: "tight",
      removeFillers: false,
      reason: "It's a comedy skit, so it needs punchlines.",
    });
  });

  it("falls back to safe defaults for garbage", () => {
    const d = normalizeDecisions({ style: "wild", effects: "all", intensity: 11 });
    expect(d.preset).toBe("energetic");
    expect(d.effects).toEqual(PRESETS.energetic.defaultEffects);
    expect(d.intensity).toBe("normal");
    expect(d.pacing).toBe("balanced");
    expect(normalizeDecisions(undefined).preset).toBe("energetic");
  });

  it("maps pacing to silence thresholds", () => {
    expect(PACING_THRESHOLD.tight).toBeLessThan(PACING_THRESHOLD.balanced);
    expect(PACING_THRESHOLD.relaxed).toBeGreaterThan(PACING_THRESHOLD.balanced);
  });
});

describe("auto prompt", () => {
  it("includes what the AI saw and the video stats", () => {
    const p = autoSystemPrompt(
      42,
      { orientation: "portrait", speechRatio: 0.8, wordsPerMinute: 170 },
      { summary: "A woman cooking adobo in a small kitchen.", contentType: "tutorial", energy: "medium", mood: "warm" },
    );
    expect(p).toContain("cooking adobo");
    expect(p).toContain("portrait, speech 80% of the time, 170 words per minute");
    expect(p).toContain('"decisions"');
  });

  it("works without snapshots", () => {
    expect(autoSystemPrompt(10, undefined, null)).toContain("No snapshots were shared");
  });
});

describe("snapshots", () => {
  it("spreads snapshot times across the video", () => {
    expect(snapshotTimes(80, 8)).toEqual([5, 15, 25, 35, 45, 55, 65, 75]);
    expect(snapshotTimes(3, 8)).toEqual([0.75, 2.25]);
    expect(snapshotTimes(0, 8)).toEqual([]);
  });

  it("only accepts small JPEG data URLs", () => {
    const base = {
      usageId: 1, preset: "energetic", duration: 10, auto: true,
      transcript: { words: [] },
    };
    const ok = { ...base, snapshots: [{ at: 1, image: "data:image/jpeg;base64,/9j/AAAA" }] };
    expect(planRequestSchema.safeParse(ok).success).toBe(true);
    const png = { ...base, snapshots: [{ at: 1, image: "data:image/png;base64,AAAA" }] };
    expect(planRequestSchema.safeParse(png).success).toBe(false);
    const tooMany = { ...base, snapshots: Array.from({ length: 9 }, () => ok.snapshots[0]) };
    expect(planRequestSchema.safeParse(tooMany).success).toBe(false);
  });
});

describe("videoStats", () => {
  it("summarizes speech and orientation", () => {
    const words = Array.from({ length: 30 }, (_, i) => ({ word: "w", start: i, end: i + 0.5 }));
    expect(videoStats(words, 60, 720, 1280)).toEqual({ orientation: "portrait", speechRatio: 0.25, wordsPerMinute: 30 });
    expect(videoStats([], 0, 0, 0).orientation).toBe("square");
  });
});

describe("contact sheet", () => {
  it("lays out up to 6 frames in a grid", async () => {
    const { sheetLayout } = await import("./engine/frames");
    expect(sheetLayout(8)).toEqual([3, 2, 6]);
    expect(sheetLayout(5)).toEqual([2, 2, 4]);
    expect(sheetLayout(3)).toEqual([3, 1, 3]);
    expect(sheetLayout(1)).toEqual([1, 1, 1]);
  });

  it("accepts at most 3 images (Groq's vision limit)", () => {
    const base = { usageId: 1, preset: "energetic", duration: 10, auto: true, transcript: { words: [] } };
    const img = { at: 1, times: [1, 2, 3], image: "data:image/jpeg;base64,/9j/AAAA" };
    expect(planRequestSchema.safeParse({ ...base, snapshots: [img] }).success).toBe(true);
    expect(planRequestSchema.safeParse({ ...base, snapshots: [img, img, img, img] }).success).toBe(false);
  });
});
