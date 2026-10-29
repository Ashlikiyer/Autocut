import { describe, expect, it } from "vitest";
import { buildEDL, removedSeconds, toOutputTime } from "./edl";

describe("buildEDL", () => {
  it("keeps everything that isn't cut", () => {
    const edl = buildEDL(10, [
      { start: 0, end: 1 },
      { start: 4, end: 6 },
    ]);
    expect(edl.segments).toEqual([
      { start: 1, end: 4 },
      { start: 6, end: 10 },
    ]);
    expect(edl.outputDuration).toBe(7);
    expect(removedSeconds(edl)).toBe(3);
  });

  it("drops segments shorter than the minimum", () => {
    const edl = buildEDL(10, [
      { start: 0, end: 5 },
      { start: 5.05, end: 10 },
    ]);
    expect(edl.segments).toEqual([]);
    expect(edl.outputDuration).toBe(0);
  });

  it("handles no cuts", () => {
    const edl = buildEDL(12.5, []);
    expect(edl.segments).toEqual([{ start: 0, end: 12.5 }]);
  });
});

describe("toOutputTime", () => {
  const edl = buildEDL(10, [
    { start: 0, end: 1 },
    { start: 4, end: 6 },
  ]);

  it("subtracts the length of cuts before a time", () => {
    expect(toOutputTime(edl, 1)).toBe(0);
    expect(toOutputTime(edl, 3)).toBe(2);
    expect(toOutputTime(edl, 7)).toBe(4); // 3 s from seg 1 + 1 s into seg 2
    expect(toOutputTime(edl, 10)).toBe(7);
  });

  it("returns null inside removed segments", () => {
    expect(toOutputTime(edl, 0.5)).toBeNull();
    expect(toOutputTime(edl, 5)).toBeNull();
    expect(toOutputTime(edl, 11)).toBeNull();
  });
});
