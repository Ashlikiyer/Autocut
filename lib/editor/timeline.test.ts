import { describe, expect, it } from "vitest";
import { computePeaks, fitZoom, inRange, scrollForZoom, tickLabel, ticks, tickStep, visibleRange } from "./timeline";

describe("timeline helpers", () => {
  it("picks ruler steps that keep labels apart", () => {
    expect(tickStep(400)).toBe(0.25);
    expect(tickStep(60)).toBe(2);
    expect(tickStep(10)).toBe(10);
  });

  it("lists aligned ticks", () => {
    expect(ticks(3.2, 9, 2)).toEqual([2, 4, 6, 8]);
    expect(ticks(0, 1, 0.5)).toEqual([0, 0.5, 1]);
  });

  it("labels ticks", () => {
    expect(tickLabel(65, 5)).toBe("1:05");
    expect(tickLabel(5.5, 0.5)).toBe("0:05.5");
    expect(tickLabel(5.25, 0.25)).toBe("0:05.25");
  });

  it("virtualises to the visible range", () => {
    const r = visibleRange(1000, 500, 100, 100);
    expect(r).toEqual({ from: 9, to: 16 });
    expect(inRange(8, 9.5, r)).toBe(true);
    expect(inRange(2, 3, r)).toBe(false);
  });

  it("fits and zooms around a point", () => {
    expect(fitZoom(100, 1040)).toBe(10);
    expect(fitZoom(10, 1040)).toBe(100);
    expect(scrollForZoom(10, 200, 120)).toBe(1000);
  });

  it("computes waveform peaks", () => {
    const samples = new Float32Array([0, 0.5, -0.9, 0.1, 0.2, -0.3]);
    const peaks = Array.from(computePeaks(samples, 6, 2));
    expect(peaks).toHaveLength(2);
    expect(peaks[0]).toBeCloseTo(0.9);
    expect(peaks[1]).toBeCloseTo(0.3);
  });
});
