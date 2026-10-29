import { describe, expect, it } from "vitest";
import type { EditSettings, VideoInfo, Word } from "@/types";
import { PRESETS } from "@/lib/presets";
import { assColor, assTime, buildAss, escapeAss, groupWords } from "./ass";
import { composeEdit } from "./compose";
import { findCuts, findFillerCuts } from "./cuts";
import { cutPoints, retimeWords, buildEDL, toOutputRange } from "./edl";

const w = (word: string, start: number, end: number): Word => ({ word, start, end });

describe("findFillerCuts", () => {
  it("cuts always-fillers including Filipino ones", () => {
    const words = [w("So", 0, 0.3), w("um", 0.4, 0.6), w("ano", 0.7, 0.9), w("parang", 1, 1.3), w("yes", 1.4, 1.7)];
    const cuts = findFillerCuts(words);
    expect(cuts).toHaveLength(3);
    expect(cuts[0].start).toBeCloseTo(0.35);
    expect(cuts[0].end).toBeCloseTo(0.65);
  });

  it("only cuts 'like' when standalone", () => {
    const meaning = [w("I", 0, 0.1), w("like", 0.12, 0.3), w("pizza", 0.32, 0.6)];
    expect(findFillerCuts(meaning)).toEqual([]);
    const filler = [w("it", 0, 0.1), w("like,", 0.4, 0.6), w("works", 0.9, 1.2)];
    expect(findFillerCuts(filler)).toHaveLength(1);
  });

  it("cuts 'you know' as a pair before a pause", () => {
    const words = [w("it", 0, 0.2), w("you", 0.3, 0.4), w("know", 0.42, 0.6), w("works", 1, 1.3)];
    const cuts = findFillerCuts(words);
    expect(cuts).toHaveLength(1);
    expect(cuts[0].start).toBeLessThan(0.3);
    expect(cuts[0].end).toBeGreaterThan(0.6);
  });

  it("only cuts 'kasi' at the start of a sentence", () => {
    const start = [w("Okay.", 0, 0.4), w("kasi", 0.5, 0.7), w("ganito", 0.75, 1.1)];
    expect(findFillerCuts(start)).toHaveLength(1);
    const middle = [w("hindi", 0, 0.3), w("kasi", 0.32, 0.5), w("pwede", 0.52, 0.8)];
    expect(findFillerCuts(middle)).toEqual([]);
  });

  it("keeps a filler when cutting it would leave a tiny piece of speech", () => {
    // "uh" sits between two long pauses; cutting it leaves "yes" (0.15 s) as an island.
    const words = [w("hello", 0, 0.5), w("yes", 1.6, 1.75), w("uh", 1.78, 1.9), w("great", 3, 3.5)];
    const withRule = findCuts(words, [], 4, { removeFillers: true, threshold: 0.5, padding: 0.1 });
    const kept = buildEDL(4, withRule).segments;
    expect(kept.some((s) => s.start <= 1.6 && s.end >= 1.75)).toBe(true);
  });
});

describe("retiming", () => {
  const edl = buildEDL(10, [{ start: 2, end: 4 }, { start: 6, end: 7 }]);

  it("maps ranges and clips them at the end of their segment", () => {
    expect(toOutputRange(edl, 1, 1.5)).toEqual({ start: 1, end: 1.5 });
    expect(toOutputRange(edl, 1.5, 3)).toEqual({ start: 1.5, end: 2 });
    expect(toOutputRange(edl, 3, 3.5)).toBeNull();
  });

  it("drops cut words and shifts the rest", () => {
    const out = retimeWords(edl, [w("a", 1, 1.2), w("b", 3, 3.2), w("c", 5, 5.5)]);
    expect(out.map((x) => [x.word, x.start, x.end])).toEqual([["a", 1, 1.2], ["c", 3, 3.5]]);
  });

  it("lists cut points with removed length", () => {
    expect(cutPoints(edl)).toEqual([{ at: 2, removed: 2 }, { at: 4, removed: 1 }]);
  });
});

describe("ASS captions", () => {
  it("formats colors and times", () => {
    expect(assColor("#C8FF2E")).toBe("&H002EFFC8");
    expect(assTime(3725.456)).toBe("1:02:05.46");
  });

  it("escapes override braces and backslashes", () => {
    expect(escapeAss("hi {\\b1}there\\N\nnow")).toBe("hi /b1there/N now");
  });

  it("groups words on pauses, punctuation and max words", () => {
    const words = [w("one", 0, 0.2), w("two.", 0.3, 0.5), w("three", 0.6, 0.8), w("four", 0.9, 1), w("five", 2, 2.2)];
    expect(groupWords(words, 3).map((c) => c.map((x) => x.word))).toEqual([["one", "two."], ["three", "four"], ["five"]]);
  });

  it("highlights the spoken word and includes hook and text pops", () => {
    const ass = buildAss({
      width: 1080,
      height: 1920,
      words: [w("make", 0, 0.3), w("money", 0.35, 0.7)],
      caption: PRESETS.energetic.caption,
      hook: { text: "The {secret}", font: "Poppins Black", color: "#C8FF2E", duration: 2.8 },
      texts: [{ start: 1, end: 2.4, text: "wow", style: "bounce" }],
    });
    expect(ass).toContain("PlayResX: 1080");
    expect(ass).toContain("Style: Caption,Poppins Black,144,");
    expect(ass).toContain("{\\1c&H002EFFC8&");
    expect(ass).toContain("MONEY");
    expect(ass).toContain(",Hook,,0,0,0,,{\\fad(120,250)");
    expect(ass).toContain("THE SECRET");
    expect(ass).not.toContain("{secret}");
    expect(ass).toContain("Pop,,0,0,0,,{\\fad(0,150)");
  });
});

describe("composeEdit", () => {
  const info: VideoInfo = { duration: 30, width: 1280, height: 720, fps: 30, hasAudio: true };
  const words = Array.from({ length: 20 }, (_, i) => w(`word${i}`, i * 1.5, i * 1.5 + 0.6));
  const settings: EditSettings = {
    auto: false, shareFrames: false, silenceThreshold: 0.5, language: "auto", preset: "energetic", captions: true, captionStyle: "energetic",
    removeFillers: true, verticalCrop: true, effects: PRESETS.energetic.defaultEffects, intensity: "normal", music: "auto",
  };
  const plan = {
    hook: "Watch this",
    music: { mood: "upbeat" as const, volume: 0.15 },
    effects: [
      { type: "zoom" as const, start: 3, end: 4.2, scale: 1.2, style: "punch" as const, shake: true },
      { type: "emoji" as const, at: 6.1, emoji: "🔥", sfx: "pop" as const },
      { type: "text" as const, at: 9.1, text: "BIG", style: "bounce" as const },
      { type: "emoji" as const, at: 9.2, emoji: "💯" },
      { type: "sfx" as const, at: 12.1, sound: "ding" as const },
    ],
  };

  it("moves the plan onto the cut timeline", () => {
    const comp = composeEdit({ words, silences: [], info, settings, plan });
    expect(comp.edl.outputDuration).toBeLessThan(30);
    expect(comp.words).toHaveLength(20);
    expect(comp.zooms).toHaveLength(1);
    expect(comp.zooms[0].start).toBeLessThan(3);
    expect(comp.cards.filter((c) => c.kind === "pop")).toHaveLength(1);
    // the emoji overlapping the text pop is dropped
    expect(comp.emojis.map((e) => e.emoji)).toEqual(["🔥"]);
    expect(comp.sfx.some((s) => s.sound === "pop")).toBe(true);
    expect(comp.flashes.length).toBeGreaterThan(0);
    expect(comp.cards.find((c) => c.kind === "hook")?.text).toBe("Watch this");
    expect(comp.music).toEqual({ source: "bundled", mood: "upbeat", volume: PRESETS.energetic.musicVolume });
    expect(comp.progressBar).toBe(true);
  });

  it("respects the toggles", () => {
    const comp = composeEdit({
      words, silences: [], info, plan,
      settings: { ...settings, captions: false, effects: [], music: "none" },
    });
    expect(comp.words).toEqual([]);
    expect(comp.zooms).toEqual([]);
    expect(comp.sfx).toEqual([]);
    expect(comp.cards).toEqual([]);
    expect(comp.music).toBeNull();
  });

  it("applies only the selected effects", () => {
    const comp = composeEdit({
      words, silences: [], info, plan,
      settings: { ...settings, effects: ["text", "vignette"] },
    });
    expect(comp.cards.filter((c) => c.kind === "pop")).toHaveLength(1);
    expect(comp.zooms).toEqual([]);
    expect(comp.emojis).toEqual([]);
    expect(comp.sfx).toEqual([]);
    expect(comp.flashes).toEqual([]);
    expect(comp.cards.some((c) => c.kind === "hook")).toBe(false);
    expect(comp.progressBar).toBe(false);
    expect(comp.vignette).toBe(true);
    expect(comp.colorBoost).toBe(false);
  });

  it("turns zooms into short shakes when only shake is selected", () => {
    const comp = composeEdit({ words, silences: [], info, plan, settings: { ...settings, effects: ["shake"] } });
    expect(comp.zooms).toHaveLength(1);
    expect(comp.zooms[0].shake).toBe(true);
    expect(comp.zooms[0].scale).toBeCloseTo(1.06);
    expect(comp.zooms[0].end - comp.zooms[0].start).toBeLessThanOrEqual(0.601);
  });

  it("adds transitions even for presets that have none", () => {
    const comp = composeEdit({
      words, silences: [], info, plan,
      settings: { ...settings, preset: "clean", effects: ["transitions", "sfx"] },
    });
    expect(comp.flashes.length).toBeGreaterThan(0);
    expect(comp.sfx.every((s) => s.sound === "whoosh" || s.sound === "ding" || s.sound === "pop")).toBe(true);
  });

  it("skips effects for long edits", () => {
    const longInfo = { ...info, duration: 400 };
    const longWords = Array.from({ length: 400 }, (_, i) => w("x", i, i + 0.9));
    const comp = composeEdit({ words: longWords, silences: [], info: longInfo, settings, plan });
    expect(comp.effectsLimited).toBe(true);
    expect(comp.zooms).toEqual([]);
    expect(comp.words.length).toBeGreaterThan(0);
  });
});

describe("peso sign fallback", () => {
  it("borrows ₱ from Anton when the caption font lacks it", async () => {
    const { withGlyphFallback } = await import("./ass");
    const out = withGlyphFallback("₱10K", "Poppins Black");
    expect(out.charCodeAt(1)).toBe(92); // a real backslash, not a form feed
    expect(out).toBe("{\\fnAnton}₱{\\fn}10K");
    expect(withGlyphFallback("₱10K", "Bangers")).toBe("₱10K");
  });
});
