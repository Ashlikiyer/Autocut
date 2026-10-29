import { describe, expect, it } from "vitest";
import type { Word } from "@/types";
import {
  findCuts,
  findDetectedSilenceCuts,
  findSilenceCuts,
  mergeRanges,
  parseSilenceDetect,
  subtractRanges,
} from "./cuts";

const w = (word: string, start: number, end: number): Word => ({ word, start, end });

describe("mergeRanges", () => {
  it("sorts and merges overlapping and touching ranges", () => {
    expect(
      mergeRanges([
        { start: 5, end: 6 },
        { start: 1, end: 2 },
        { start: 1.5, end: 3 },
        { start: 3, end: 4 },
      ]),
    ).toEqual([
      { start: 1, end: 4 },
      { start: 5, end: 6 },
    ]);
  });

  it("drops empty ranges", () => {
    expect(mergeRanges([{ start: 2, end: 2 }])).toEqual([]);
  });
});

describe("subtractRanges", () => {
  it("punches holes", () => {
    expect(
      subtractRanges([{ start: 0, end: 10 }], [
        { start: 2, end: 3 },
        { start: 8, end: 12 },
      ]),
    ).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 8 },
    ]);
  });
});

describe("findSilenceCuts", () => {
  const words = [w("So", 1, 1.4), w("hello", 1.5, 2), w("world", 3.5, 4)];

  it("cuts gaps longer than the threshold, keeping padding next to speech", () => {
    const cuts = findSilenceCuts(words, 6, { threshold: 0.5, padding: 0.1 });
    expect(cuts).toEqual([
      { start: 0, end: 0.9 }, // leading silence, cut to the edge
      { start: 2.1, end: 3.4 }, // gap between words, padded both sides
      { start: 4.1, end: 6 }, // trailing silence, cut to the edge
    ]);
  });

  it("keeps gaps at or under the threshold", () => {
    const cuts = findSilenceCuts(words, 4.2, { threshold: 0.5, padding: 0.1 });
    // 1.4→1.5 (0.1 s) and 4→4.2 (0.2 s) stay
    expect(cuts.some((c) => c.start > 1.3 && c.end < 1.6)).toBe(false);
    expect(cuts.at(-1)).toEqual({ start: 2.1, end: 3.4 });
  });

  it("respects a custom threshold", () => {
    expect(findSilenceCuts(words, 4, { threshold: 2, padding: 0.1 })).toEqual([]);
  });

  it("returns nothing without words", () => {
    expect(findSilenceCuts([], 10)).toEqual([]);
  });

  it("treats overlapping words as continuous speech", () => {
    const cuts = findSilenceCuts([w("a", 0, 2), w("b", 1.5, 3)], 3, { threshold: 0.5 });
    expect(cuts).toEqual([]);
  });
});

describe("findDetectedSilenceCuts", () => {
  it("never cuts inside a word", () => {
    const silences = [{ start: 2, end: 6 }];
    const words = [w("long", 3, 3.5)];
    const cuts = findDetectedSilenceCuts(silences, words, 10, { threshold: 0.5, padding: 0.1 });
    expect(cuts).toEqual([
      { start: 2.1, end: 2.9 },
      { start: 3.6, end: 5.9 },
    ]);
  });

  it("works with no words at all (music-only or silent speech)", () => {
    const cuts = findDetectedSilenceCuts([{ start: 0, end: 2 }], [], 5, { padding: 0.1 });
    expect(cuts).toEqual([{ start: 0, end: 1.9 }]);
  });
});

describe("parseSilenceDetect", () => {
  it("pairs start and end lines and closes a trailing silence", () => {
    const log = [
      "[silencedetect @ 0x1] silence_start: 1.234",
      "[silencedetect @ 0x1] silence_end: 2.5 | silence_duration: 1.266",
      "frame=  10 time=00:00:03.00",
      "[silencedetect @ 0x1] silence_start: 8",
    ];
    expect(parseSilenceDetect(log, 10)).toEqual([
      { start: 1.234, end: 2.5 },
      { start: 8, end: 10 },
    ]);
  });

  it("clamps negative starts", () => {
    expect(
      parseSilenceDetect(["silence_start: -0.01", "silence_end: 1"], 5),
    ).toEqual([{ start: 0, end: 1 }]);
  });
});

describe("findCuts", () => {
  it("merges word-gap cuts with detected silences", () => {
    const words = [w("a", 0, 1), w("b", 3, 4)];
    const cuts = findCuts(words, [{ start: 5, end: 7 }], 8, { threshold: 0.5, padding: 0.1 });
    expect(cuts).toEqual([
      { start: 1.1, end: 2.9 },
      { start: 4.1, end: 8 },
    ]);
  });
});
