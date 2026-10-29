import { describe, expect, it } from "vitest";
import { effectCaps, normalizePlan, effectsPlanSchema } from "./plan";
import { fallbackPlan } from "./ai/fallback";
import { systemPrompt, transcriptLines } from "./ai/prompts";

describe("normalizePlan", () => {
  it("drops unknown types, bad times, unknown sounds and emoji", () => {
    const plan = normalizePlan(
      {
        hook: "  The   secret nobody tells you about money ",
        music: { mood: "upbeat", volume: 2 },
        effects: [
          { type: "zoom", start: 3, end: 5, scale: 9 },
          { type: "zoom", start: 3.5, end: 6 }, // overlaps the first
          { type: "zoom", start: 50, end: 52 }, // past the end
          { type: "emoji", at: 8, emoji: "💰", sfx: "pop" },
          { type: "emoji", at: 12, emoji: "🦄" }, // not allowed
          { type: "emoji", at: 14, emoji: "❤" }, // matches ❤️
          { type: "text", at: 20, text: "THIS IS WAY TOO MANY WORDS", style: "wiggle" },
          { type: "sfx", at: 21, sound: "fart" },
          { type: "sfx", at: 22, sound: "ding" },
          { type: "explode", at: 1 },
          "garbage",
        ],
      },
      "energetic",
      40,
    );
    expect(plan.hook).toBe("The secret nobody tells you about");
    expect(plan.music).toEqual({ mood: "upbeat", volume: 0.3 });
    expect(plan.effects).toEqual([
      { type: "zoom", start: 3, end: 5, scale: 1.4 },
      { type: "emoji", at: 8, emoji: "💰", sfx: "pop" },
      { type: "emoji", at: 14, emoji: "❤️" },
      { type: "text", at: 20, text: "THIS IS WAY TOO", style: "bounce" },
      { type: "sfx", at: 22, sound: "ding" },
    ]);
    expect(effectsPlanSchema.safeParse(plan).success).toBe(true);
  });

  it("caps effects per minute by preset", () => {
    const effects = Array.from({ length: 30 }, (_, i) => ({ type: "emoji", at: i * 2, emoji: "🔥" }));
    expect(normalizePlan({ hook: "", effects }, "energetic", 60).effects).toHaveLength(4);
    expect(normalizePlan({ hook: "", effects }, "clean", 60).effects).toHaveLength(0);
  });

  it("honors the user's effect selection and amount", () => {
    const effects = Array.from({ length: 30 }, (_, i) => ({ type: "emoji", at: i * 2, emoji: "🔥" }));
    // Clean has no emoji by default, but the user switched them on.
    expect(normalizePlan({ hook: "", effects }, "clean", 60, { effects: ["emoji"] }).effects).toHaveLength(2);
    expect(normalizePlan({ hook: "", effects }, "energetic", 60, { effects: ["emoji"], intensity: "more" }).effects).toHaveLength(6);
    expect(normalizePlan({ hook: "", effects }, "energetic", 60, { effects: ["zoom"] }).effects).toHaveLength(0);
  });

  it("computes caps per selection", () => {
    expect(effectCaps("podcast", { effects: [] })).toEqual({ zooms: 0, emoji: 0, text: 0, sfx: 0 });
    expect(effectCaps("podcast", { effects: ["sfx", "shake"] })).toEqual({ zooms: 2, emoji: 0, text: 0, sfx: 3 });
    expect(effectCaps("energetic", { intensity: "less" }).zooms).toBe(3);
  });

  it("survives total garbage", () => {
    const plan = normalizePlan("not json at all", "funny", 30);
    expect(plan).toEqual({ hook: "", music: { mood: "none", volume: 0.15 }, effects: [] });
  });
});

describe("fallbackPlan", () => {
  const words = Array.from({ length: 60 }, (_, i) => ({ word: i % 8 === 7 ? "end." : "w", start: i * 0.5, end: i * 0.5 + 0.4 }));

  it("adds zooms within preset caps and no emoji", () => {
    const plan = fallbackPlan(words, "energetic", 30);
    expect(plan.effects.length).toBeGreaterThan(0);
    expect(plan.effects.every((e) => e.type === "zoom")).toBe(true);
    expect(plan.effects.length).toBeLessThanOrEqual(6);
    expect(plan.music.mood).toBe("upbeat");
  });

  it("adds nothing for presets without zooms", () => {
    expect(fallbackPlan(words, "podcast", 30).effects.length).toBeLessThanOrEqual(1);
  });
});

describe("prompts", () => {
  it("asks for selective moments, not effect quotas", () => {
    const p = systemPrompt("funny", 120);
    expect(p).toContain('"punchline"');
    expect(p).toContain("Most sentences get NO moment");
    expect(p).toContain("At most 3-6 moments per minute");
    expect(p).not.toContain('"effects": [');
  });

  it("tells the AI which effects the user turned off", () => {
    const p = systemPrompt("energetic", 60, { effects: ["sfx"] });
    expect(p).toContain("turned zooms off");
    expect(p).toContain("turned text pops off");
  });

  it("formats numbered transcript lines", () => {
    const lines = transcriptLines([
      { word: "Hello", start: 0, end: 0.4 },
      { word: "there.", start: 0.5, end: 0.9 },
      { word: "Next", start: 2, end: 2.3 },
    ]);
    expect(lines).toBe("1. [0.00-0.90] Hello there.\n2. [2.00-2.30] Next");
  });
});
