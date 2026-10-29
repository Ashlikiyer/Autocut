import { describe, expect, it } from "vitest";
import type { Word } from "@/types";
import type { Composition } from "@/lib/engine/compose";
import { buildEDL } from "@/lib/engine/edl";
import { projectToComposition } from "./convert";
import { moveItem } from "./ops";
import { testProject } from "./fixtures";
import {
  captionAt,
  cardStateAt,
  flashAt,
  focusAt,
  formatTimecode,
  musicGainAt,
  shakeAt,
  speechRanges,
  stickerStateAt,
  zoomAt,
} from "./preview";

const w = (word: string, start: number, end: number): Word => ({ word, start, end });
const comp = (over: Partial<Composition>) =>
  ({ edl: buildEDL(20, [{ start: 5, end: 6 }, { start: 10, end: 11 }]), zooms: [], flashes: [], cards: [], cutZoom: false, ...over }) as Composition;

describe("preview matches the export's math", () => {
  it("zooms like the filter graph (punch ramp, hold, release)", () => {
    const c = comp({ zooms: [{ start: 2, end: 4, scale: 1.2, shake: false, style: "punch" }] });
    expect(zoomAt(c, 1.9)).toBe(1);
    expect(zoomAt(c, 2.06)).toBeCloseTo(1.1, 2);
    expect(zoomAt(c, 3)).toBeCloseTo(1.2, 5);
    expect(zoomAt(c, 3.9)).toBeCloseTo(1.1, 2);
  });

  it("adds jump-cut zoom on every other clip", () => {
    const c = comp({ cutZoom: true }); // clips: 0–5, 5–9, 9–18 (output)
    expect(zoomAt(c, 2)).toBe(1);
    expect(zoomAt(c, 6)).toBeCloseTo(1.1);
    expect(zoomAt(c, 12)).toBe(1);
  });

  it("shakes only in the first 0.45 s of a shaking zoom", () => {
    const c = comp({ zooms: [{ start: 2, end: 4, scale: 1.2, shake: true, style: "punch" }] });
    expect(shakeAt(c, 2.2).x).not.toBe(0);
    expect(shakeAt(c, 3)).toEqual({ x: 0, y: 0 });
  });

  it("flashes and focuses", () => {
    const c = comp({ flashes: [5], cards: [{ kind: "focus", start: 8, end: 10, text: "BIG" }] });
    expect(flashAt(c, 5)).toBeCloseTo(0.55);
    expect(flashAt(c, 5.1)).toBeCloseTo(0.275);
    expect(flashAt(c, 5.3)).toBe(0);
    expect(focusAt(c, 9)).toBe(true);
    expect(focusAt(c, 11)).toBe(false);
  });

  it("fades and slides cards in and out", () => {
    const card = { kind: "step" as const, start: 4, end: 7, text: "x" };
    expect(cardStateAt(card, 3.9).visible).toBe(false);
    expect(cardStateAt(card, 4.09).visible).toBe(true);
    expect(cardStateAt(card, 4.09).opacity).toBeCloseTo(0.5);
    expect(cardStateAt(card, 4.09).dy).toBeGreaterThan(0); // rising
    expect(cardStateAt({ ...card, kind: "pill" }, 4.09).dy).toBeLessThan(0); // pills drop
    expect(cardStateAt(card, 5)).toEqual({ visible: true, opacity: 1, dy: 0 });
    expect(cardStateAt(card, 6.9).opacity).toBeCloseTo(0.5);
  });

  it("rises stickers into place", () => {
    const e = { emoji: "🔥", start: 1, end: 2 };
    expect(stickerStateAt(e, 1).dy).toBeCloseTo(0.05);
    expect(stickerStateAt(e, 1.5).dy).toBe(0);
  });
});

describe("captions", () => {
  const groups = [[w("one", 1, 1.4), w("two", 1.5, 2)], [w("three", 2.1, 2.5)]];

  it("shows the group and the word being spoken", () => {
    expect(captionAt(groups, 0.9)).toBeNull();
    expect(captionAt(groups, 1.6)).toMatchObject({ active: 1 });
    expect(captionAt(groups, 2.05)?.words[0].word).toBe("one"); // until the next group starts
    expect(captionAt(groups, 2.2)?.words[0].word).toBe("three");
    expect(captionAt(groups, 2.85)).toBeNull(); // ends 0.3 s after the last word
  });

  it("hides captions under a focus title", () => {
    expect(captionAt(groups, 1.6, [{ start: 1, end: 3 }])).toBeNull();
  });
});

describe("audio", () => {
  it("merges speech into ranges for ducking", () => {
    expect(speechRanges([w("a", 1, 1.5), w("b", 1.7, 2), w("c", 4, 4.5)], 0.25)).toEqual([
      { start: 0.75, end: 2.25 },
      { start: 3.75, end: 4.75 },
    ]);
  });

  it("fades music in and out", () => {
    const m = { start: 0, end: 10, volume: 0.2, fadeIn: 1, fadeOut: 2 };
    expect(musicGainAt(m, 0.5)).toBeCloseTo(0.1);
    expect(musicGainAt(m, 5)).toBeCloseTo(0.2);
    expect(musicGainAt(m, 9)).toBeCloseTo(0.1);
    expect(musicGainAt(m, 11)).toBe(0);
  });

  it("formats time", () => {
    expect(formatTimecode(65.25)).toBe("1:05.3");
    expect(formatTimecode(3)).toBe("0:03.0");
  });
});

describe("positions in the adapter", () => {
  it("leaves untouched AI cards and stickers at the renderer's defaults", () => {
    const p = testProject();
    p.texts[0] = { ...p.texts[0], variant: "step", x: 0.5, y: 0.11 };
    const c = projectToComposition(p);
    expect(c.cards[0].x).toBeUndefined();
    expect(c.emojis[0].x).toBeUndefined();
  });

  it("passes positions once an item is moved", () => {
    const p = testProject();
    p.texts[0] = { ...p.texts[0], variant: "step", x: 0.3, y: 0.2 };
    p.stickers[0] = { ...p.stickers[0], x: 0.7 };
    const c = projectToComposition(moveItem(p, { track: "texts", id: "t1" }, 2));
    expect(c.cards[0]).toMatchObject({ x: 0.3, y: 0.2 });
    expect(c.emojis[0]).toMatchObject({ x: 0.7, y: 0.32 });
  });
});
