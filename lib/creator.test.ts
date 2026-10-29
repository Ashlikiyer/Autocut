import { describe, expect, it } from "vitest";
import type { EditSettings, VideoInfo, Word } from "@/types";
import { PRESETS } from "@/lib/presets";
import { momentsToEffects, normalizeMoments } from "./moments";
import { normalizePlan } from "./plan";
import { composeEdit, type Composition } from "./engine/compose";
import { buildEDL } from "./engine/edl";
import { buildAss } from "./engine/ass";
import { buildRenderGraph, cutZoomRanges, PREVIEW_QUALITY } from "./engine/filtergraph";

const w = (word: string, start: number, end: number): Word => ({ word, start, end });
const words = Array.from({ length: 80 }, (_, i) => w("word", i * 0.5, i * 0.5 + 0.4));
const info: VideoInfo = { duration: 40, width: 720, height: 1280, fps: 30, hasAudio: true };
const settings: EditSettings = {
  auto: false, shareFrames: false, silenceThreshold: 0.5, language: "auto", preset: "creator",
  captions: true, captionStyle: "creator", removeFillers: false, verticalCrop: true,
  effects: PRESETS.creator.defaultEffects, intensity: "normal", music: "none",
};

describe("card moments", () => {
  it("keeps card wording and fixed on-screen times", () => {
    const { moments } = normalizeMoments(
      [
        { type: "pill", start: 2, text: "₱0 · walang paid course para sa lahat ng tao" },
        { type: "step", start: 8, label: "Step 1", text: "download claude" },
        { type: "focus", start: 16, text: "sharingan method" },
        { type: "pill", start: 30 }, // no text → dropped
      ],
      words,
      40,
    );
    expect(moments).toEqual([
      { type: "pill", start: 2, end: 5, text: "₱0 · walang paid course para" },
      { type: "step", start: 8, end: 11.2, text: "download claude", label: "Step 1" },
      { type: "focus", start: 16, end: 18.2, text: "sharingan method" },
    ]);
  });

  it("turns list items into numbered STEP cards and numbers into pills in the Creator style", () => {
    const fx = momentsToEffects(
      [
        { type: "list_item", start: 2, end: 3, text: "Download Claude" },
        { type: "list_item", start: 9, end: 10, text: "Open terminal" },
        { type: "number", start: 15, end: 16, text: "₱0 COST" },
      ],
      "creator",
    );
    const cards = fx.filter((e) => e.type === "card");
    expect(cards).toEqual([
      { type: "card", kind: "step", at: 2, end: 5.2, text: "Download Claude", label: "STEP 1" },
      { type: "card", kind: "step", at: 9, end: 12.2, text: "Open terminal", label: "STEP 2" },
      { type: "card", kind: "pill", at: 15, end: 18, text: "₱0 COST" },
    ]);
    // Other styles keep text pops.
    expect(momentsToEffects([{ type: "list_item", start: 2, end: 3, text: "X" }], "energetic").some((e) => e.type === "card")).toBe(false);
  });

  it("validates hook accent and sticker", () => {
    const plan = normalizePlan({ hook: "24/7 AI video editor", hookAccent: "AI", hookSticker: "no course needed at all today", moments: [] }, "creator", 40, { words });
    expect(plan.hookAccent).toBe("AI");
    expect(plan.hookSticker).toBe("no course needed at");
    expect(normalizePlan({ hook: "Hello", hookAccent: "Bye" }, "creator", 40, { words }).hookAccent).toBeUndefined();
  });
});

describe("Creator composition", () => {
  const plan = normalizePlan(
    {
      hook: "24/7 AI video editor",
      hookAccent: "AI",
      moments: [
        { type: "pill", start: 0.5, text: "FREE" }, // clashes with the hook → dropped
        { type: "step", start: 8, label: "STEP 1", text: "Download" },
        { type: "focus", start: 20, text: "Big idea" },
        { type: "pill", start: 30, text: "Ready" },
      ],
    },
    "creator",
    40,
    { words, effects: settings.effects },
  );

  it("puts the hook on a card, keeps one top card at a time and uses cut-zoom", () => {
    const comp = composeEdit({ words, silences: [], info, settings, plan });
    expect(comp.hook).toBeNull();
    expect(comp.cards.map((c) => c.kind)).toEqual(["hook", "step", "focus", "pill"]);
    expect(comp.cards[0]).toMatchObject({ text: "24/7 AI video editor", accent: "AI" });
    expect(comp.cutZoom).toBe(true);
    expect(comp.caption?.maxWords).toBe(1);
  });

  it("drops a card type and its sound when switched off", () => {
    const comp = composeEdit({ words, silences: [], info, plan, settings: { ...settings, effects: ["cards", "sfx", "hook"] } });
    expect(comp.cards.some((c) => c.kind === "pill")).toBe(false);
    expect(comp.sfx.some((s) => s.sound === "click")).toBe(false);
    expect(comp.sfx.some((s) => s.sound === "whoosh")).toBe(true);
  });

  it("renders cards, focus blur and cut-zoom into the graph", () => {
    const comp = composeEdit({ words, silences: [], info, settings, plan });
    const { graph, inputArgs } = buildRenderGraph(comp, info, PREVIEW_QUALITY, {
      emojiPaths: [],
      cardPaths: comp.cards.map((_, i) => `/card_${i}.png`),
      sfxPaths: {},
    });
    expect(inputArgs.filter((a) => a.startsWith("/card_"))).toHaveLength(4);
    expect(inputArgs).toContain("-loop");
    expect(graph).toContain("fade=t=in:st=0:d=0.18:alpha=1");
    expect(graph).toContain("setpts=PTS-STARTPTS+");
    expect(graph).toContain("gblur=sigma=");
    expect(graph).toContain("eof_action=pass");
  });

  it("hides captions while a focus title is up", () => {
    const ass = buildAss({
      width: 1080, height: 1920, caption: PRESETS.creator.caption, texts: [],
      words: [w("before", 1, 1.4), w("during", 20.5, 21), w("after", 25, 25.4)],
      hideCaptions: [{ start: 20, end: 22.2 }],
    });
    expect(ass).toContain("BEFORE");
    expect(ass).not.toContain("DURING");
    expect(ass).toContain("AFTER");
  });
});

describe("cut-zoom", () => {
  it("frames every other kept segment closer", () => {
    const edl = buildEDL(10, [{ start: 2, end: 3 }, { start: 5, end: 6 }]);
    const comp = { edl, cutZoom: true } as Composition;
    expect(cutZoomRanges(comp)).toEqual([{ start: 2, end: 4 }]);
    expect(cutZoomRanges({ edl, cutZoom: false } as Composition)).toEqual([]);
  });
});
