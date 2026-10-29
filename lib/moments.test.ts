import { describe, expect, it } from "vitest";
import type { Word } from "@/types";
import { momentsToEffects, normalizeMoments } from "./moments";
import { normalizePlan } from "./plan";
import { fallbackPlan } from "./ai/fallback";

const w = (word: string, start: number, end: number): Word => ({ word, start, end });
// ~40 s of speech: one word every 0.5 s
const words = Array.from({ length: 80 }, (_, i) => w(i === 30 ? "₱10,000" : "word", i * 0.5, i * 0.5 + 0.4));

describe("normalizeMoments", () => {
  it("snaps moments to spoken words and drops ones on silence or out of range", () => {
    const { moments } = normalizeMoments(
      [
        { type: "punchline", start: 5.1, end: 6.2, emoji: "😂" },
        { type: "reveal", start: 100, end: 101 }, // past the end
        { type: "dance", start: 8 }, // unknown type
        { type: "number", start: 15.05, text: "  ten   thousand pesos in one week " },
      ],
      words,
      40,
    );
    expect(moments).toEqual([
      { type: "punchline", start: 5, end: 6.4, emoji: "😂" },
      { type: "number", start: 15, end: 16.4, text: "ten thousand pesos in" },
    ]);
  });

  it("drops overlapping moments and unknown emoji", () => {
    const { moments } = normalizeMoments(
      [
        { type: "reaction", start: 10, end: 12, emoji: "🦄" },
        { type: "key_point", start: 11, end: 13 },
      ],
      words,
      40,
    );
    expect(moments).toHaveLength(1);
    expect(moments[0].emoji).toBeUndefined();
  });

  it("collects emphasis spans for key words", () => {
    const { emphasis } = normalizeMoments([{ type: "number", start: 15, end: 15.4, emphasis: ["₱10,000"] }], words, 40);
    expect(emphasis).toEqual([{ start: 15, end: 15.4 }]);
  });
});

describe("momentsToEffects", () => {
  it("gives each moment type its own recipe", () => {
    const effects = momentsToEffects(
      [
        { type: "punchline", start: 2, end: 3, emoji: "😂" },
        { type: "number", start: 8, end: 9, text: "₱10K" },
        { type: "emotional", start: 14, end: 20 },
        { type: "question", start: 24, end: 25, text: "BAKIT?" },
      ],
      "funny",
    );
    const at = (t: number) => effects.filter((e) => (e.type === "zoom" ? e.start : e.at) === t || (e.type === "sfx" && Math.abs(e.at - t) < 0.1));
    expect(at(2).map((e) => e.type).sort()).toEqual(["emoji", "sfx", "zoom"]);
    expect(at(2).find((e) => e.type === "zoom")).toMatchObject({ style: "punch", shake: true });
    expect(at(8).map((e) => e.type).sort()).toEqual(["sfx", "text"]); // no zoom on numbers
    expect(at(14)).toEqual([{ type: "zoom", start: 14, end: 19, scale: 1.08, style: "slow" }]); // no sound
    expect(at(24).find((e) => e.type === "text")).toMatchObject({ text: "BAKIT?", style: "shake" });
  });
});

describe("normalizePlan with moments", () => {
  it("never lets punch zooms come closer than the preset's gap", () => {
    const moments = Array.from({ length: 20 }, (_, i) => ({ type: "key_point", start: i * 2, end: i * 2 + 1 }));
    const plan = normalizePlan({ hook: "", moments }, "energetic", 40, { words });
    const starts = plan.effects.filter((e) => e.type === "zoom").map((e) => (e.type === "zoom" ? e.start : 0));
    expect(starts.length).toBeGreaterThan(0);
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(5);
    expect(plan.moments?.length).toBeGreaterThan(0);
  });

  it("keeps moments whole and caps them per minute", () => {
    const moments = Array.from({ length: 13 }, (_, i) => ({ type: "number", start: i * 3, end: i * 3 + 1, text: "BIG" }));
    const plan = normalizePlan({ hook: "", moments }, "energetic", 40, { words });
    const texts = plan.effects.filter((e) => e.type === "text").length;
    const dings = plan.effects.filter((e) => e.type === "sfx").length;
    expect(plan.moments?.length).toBe(4); // 6/min × 0.67 min
    expect(texts).toBeLessThanOrEqual(4);
    expect(dings).toBe(texts);
  });

  it("returns no effects when the AI finds no moments", () => {
    expect(normalizePlan({ hook: "Hi", moments: [] }, "energetic", 40, { words }).effects).toEqual([]);
  });
});

describe("fallbackPlan", () => {
  it("finds numbers and key points without the AI", () => {
    const plan = fallbackPlan(words, "energetic", 40);
    expect(plan.effects.some((e) => e.type === "text" && e.text.includes("₱10,000"))).toBe(true);
    expect(plan.effects.some((e) => e.type === "zoom")).toBe(true);
  });
});
