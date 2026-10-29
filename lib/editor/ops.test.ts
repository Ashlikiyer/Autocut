import { describe, expect, it } from "vitest";
import { testProject } from "./fixtures";
import {
  clipAt,
  clipRanges,
  deleteClip,
  deleteItem,
  duplicateItem,
  itemSpan,
  moveItem,
  outputToSource,
  projectDuration,
  rippleInsert,
  rippleRemove,
  setCaptionText,
  snap,
  snapSpan,
  snapTargets,
  sourceToOutput,
  splitClip,
  splitItem,
  trimClip,
  trimItem,
  updateItem,
} from "./ops";

describe("time mapping", () => {
  const p = testProject();

  it("lays clips back to back", () => {
    expect(clipRanges(p.clips).map((c) => [c.start, c.end])).toEqual([[0, 5], [5, 11], [11, 17]]);
    expect(projectDuration(p)).toBe(17);
  });

  it("maps output ↔ source time", () => {
    expect(outputToSource(p.clips, 6)).toBe(9);
    expect(outputToSource(p.clips, 11)).toBe(20); // boundary belongs to the later clip
    expect(outputToSource(p.clips, 17)).toBe(26);
    expect(outputToSource(p.clips, 18)).toBeNull();
    expect(sourceToOutput(p.clips, 21)).toBe(12);
    expect(sourceToOutput(p.clips, 6)).toBeNull(); // cut
    expect(clipAt(p.clips, 4.99)?.id).toBe("a");
  });
});

describe("clip editing", () => {
  it("splits the clip under the playhead", () => {
    const p = splitClip(testProject(), 7);
    expect(p.clips.map((c) => [c.sourceIn, c.sourceOut])).toEqual([[0, 5], [8, 10], [10, 14], [20, 26]]);
    expect(projectDuration(p)).toBe(17);
  });

  it("won't split right at an edge", () => {
    const p = testProject();
    expect(splitClip(p, 5.05)).toBe(p);
  });

  it("deletes a clip and ripples overlays (magnetic track)", () => {
    const p = deleteClip(testProject(), "b"); // removes output 5–11
    expect(projectDuration(p)).toBe(11);
    expect(p.texts).toEqual([]); // the text sat on clip b
    expect(p.sfx).toEqual([]);
    expect(p.stickers[0]).toMatchObject({ start: 6, end: 8 }); // was 12–14
    expect(p.captions.groups.map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(p.captions.groups[1]).toMatchObject({ start: 6, end: 7 });
    expect(p.captions.groups[1].words[0]).toMatchObject({ start: 6, end: 7 });
    expect(p.music[0]).toMatchObject({ start: 0, end: 11 }); // shortened across the cut
    expect(p.transitions[0].at).toBe(5); // was on the b|c boundary
  });

  it("never deletes the last clip", () => {
    let p = deleteClip(testProject(), "a");
    p = deleteClip(p, "b");
    expect(deleteClip(p, "c")).toBe(p);
  });

  it("trims a clip's out point and ripples what follows", () => {
    const p = trimClip(testProject(), "b", "out", 12); // b: 8–12, removes output 9–11
    expect(p.clips[1]).toMatchObject({ sourceIn: 8, sourceOut: 12 });
    expect(projectDuration(p)).toBe(15);
    expect(p.stickers[0]).toMatchObject({ start: 10, end: 12 });
    expect(p.texts[0]).toMatchObject({ start: 6, end: 8 }); // before the cut
  });

  it("extends a clip but never into its neighbour's source", () => {
    const p = trimClip(testProject(), "b", "out", 25); // next clip starts at source 20
    expect(p.clips[1].sourceOut).toBe(20);
    expect(projectDuration(p)).toBe(23);
    expect(p.stickers[0]).toMatchObject({ start: 18, end: 20 }); // shifted +6
  });

  it("trims a clip's in point", () => {
    const p = trimClip(testProject(), "b", "in", 10); // removes output 5–7
    expect(p.clips[1].sourceIn).toBe(10);
    expect(p.texts[0]).toMatchObject({ start: 5, end: 6 }); // was 6–8, lost its first second
    const back = trimClip(testProject(), "b", "in", 2); // previous clip ends at source 5
    expect(back.clips[1].sourceIn).toBe(5);
  });
});

describe("ripple", () => {
  it("removes, shifts and shortens", () => {
    const p = rippleRemove(testProject(), 2.5, 1); // cut output 2.5–3.5
    expect(p.zooms[0]).toMatchObject({ start: 2, end: 2.5 });
    expect(p.texts[0]).toMatchObject({ start: 5, end: 7 });
  });

  it("inserts a gap", () => {
    const p = rippleInsert(testProject(), 6, 2);
    expect(p.texts[0]).toMatchObject({ start: 8, end: 10 });
    expect(p.zooms[0]).toMatchObject({ start: 2, end: 3 });
    expect(p.sfx[0].start).toBe(8.5);
  });
});

describe("overlay editing", () => {
  const text = { track: "texts" as const, id: "t1" };

  it("moves inside the video", () => {
    expect(moveItem(testProject(), text, 3).texts[0]).toMatchObject({ start: 3, end: 5 });
    expect(moveItem(testProject(), text, 99).texts[0]).toMatchObject({ start: 15, end: 17 });
    expect(moveItem(testProject(), text, -4).texts[0]).toMatchObject({ start: 0, end: 2 });
  });

  it("moves captions with their words", () => {
    const g = moveItem(testProject(), { track: "captions", id: "g1" }, 3).captions.groups[0];
    expect(g).toMatchObject({ start: 3, end: 4 });
    expect(g.words.map((w) => [w.start, w.end])).toEqual([[3, 3.4], [3.5, 4]]);
  });

  it("trims edges with a minimum length", () => {
    expect(trimItem(testProject(), text, "end", 9).texts[0].end).toBe(9);
    expect(trimItem(testProject(), text, "start", 7.99).texts[0].start).toBe(7.9);
    expect(trimItem(testProject(), text, "end", 50).texts[0].end).toBe(17);
  });

  it("stretches caption words when trimming a caption", () => {
    const g = trimItem(testProject(), { track: "captions", id: "g1" }, "end", 3).captions.groups[0];
    expect(g.words.map((w) => [w.start, w.end])).toEqual([[1, 1.8], [2, 3]]);
  });

  it("splits an overlay", () => {
    const p = splitItem(testProject(), text, 7);
    expect(p.texts.map((t) => [t.start, t.end])).toEqual([[6, 7], [7, 8]]);
    expect(p.texts[0].id).not.toBe(p.texts[1].id);
  });

  it("duplicates right after the original", () => {
    const { project, ref } = duplicateItem(testProject(), text);
    expect(project.texts).toHaveLength(2);
    expect(itemSpan(project, ref!)).toEqual({ start: 8, end: 10 });
    const sfx = duplicateItem(testProject(), { track: "sfx", id: "x1" });
    expect(sfx.project.sfx[1].start).toBeCloseTo(6.7);
  });

  it("deletes and updates", () => {
    expect(deleteItem(testProject(), text).texts).toEqual([]);
    expect(deleteItem(testProject(), { track: "captions", id: "g1" }).captions.groups).toHaveLength(1);
    expect(updateItem(testProject(), text, { text: "Hi", color: "#FF0000" }).texts[0]).toMatchObject({ text: "Hi", color: "#FF0000" });
  });

  it("never mutates its input", () => {
    const p = testProject();
    const before = JSON.stringify(p);
    deleteClip(p, "b");
    trimClip(p, "b", "out", 12);
    moveItem(p, text, 2);
    setCaptionText(p, "g1", "a b c");
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe("captions", () => {
  it("spreads edited words evenly and keeps emphasis on matching words", () => {
    const p = testProject();
    p.captions.groups[0].words[1].emphasis = true;
    const g = setCaptionText(p, "g1", "uno Two tres").captions.groups[0];
    expect(g.words).toEqual([
      { text: "uno", start: 1, end: 1.333 },
      { text: "Two", start: 1.333, end: 1.667, emphasis: true },
      { text: "tres", start: 1.667, end: 2 },
    ]);
  });

  it("deletes a group when its text is cleared", () => {
    expect(setCaptionText(testProject(), "g1", "   ").captions.groups).toHaveLength(1);
  });
});

describe("snapping", () => {
  it("collects edges, clip boundaries and the playhead", () => {
    const targets = snapTargets(testProject(), 9.3, { track: "texts", id: "t1" });
    expect(targets).toContain(9.3);
    expect(targets).toContain(11);
    expect(targets).not.toContain(6); // the moving item's own edge
  });

  it("snaps within the threshold only", () => {
    expect(snap(10.93, [5, 11], 0.1)).toBe(11);
    expect(snap(10.8, [5, 11], 0.1)).toBe(10.8);
  });

  it("snaps a moving item by whichever edge is closer", () => {
    expect(snapSpan(9.05, 2, [9, 11.2], 0.1)).toBe(9); // start snaps
    expect(snapSpan(9.15, 2, [9, 11.2], 0.1)).toBe(9.2); // end snaps to 11.2
  });
});
