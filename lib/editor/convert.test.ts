import { beforeEach, describe, expect, it } from "vitest";
import type { EditSettings, VideoInfo, Word } from "@/types";
import { PRESETS } from "@/lib/presets";
import { normalizePlan } from "@/lib/plan";
import { composeEdit } from "@/lib/engine/compose";
import { buildRenderGraph, PREVIEW_QUALITY } from "@/lib/engine/filtergraph";
import { DEFAULT_TEXT_POSITION, newTextItem, projectFromComposition, projectToComposition } from "./convert";
import { projectDuration, splitClip } from "./ops";
import { testProject } from "./fixtures";
import { editorHistory, useEditorStore } from "./store";

const words: Word[] = Array.from({ length: 60 }, (_, i) => ({ word: `w${i}`, start: i * 0.5, end: i * 0.5 + 0.4 }));
const info: VideoInfo = { duration: 32, width: 720, height: 1280, fps: 30, hasAudio: true };
const settings: EditSettings = {
  auto: false, shareFrames: false, silenceThreshold: 0.5, language: "auto", preset: "creator",
  captions: true, captionStyle: "creator", removeFillers: false, verticalCrop: true,
  effects: [...PRESETS.creator.defaultEffects, "emoji", "zoom", "text"], intensity: "normal", music: "auto",
};
const plan = normalizePlan(
  {
    hook: "24/7 AI editor",
    hookAccent: "AI",
    music: { mood: "chill", volume: 0.1 },
    moments: [
      { type: "step", start: 5, label: "STEP 1", text: "Download" },
      { type: "punchline", start: 12, end: 13, emoji: "😂" },
      { type: "focus", start: 18, text: "Big idea" },
    ],
  },
  "creator",
  32,
  { words, effects: settings.effects },
);
const comp = composeEdit({ words, silences: [], info, settings, plan });

it("uses a fixture with something in every track", () => {
  expect(comp.cards.length).toBeGreaterThanOrEqual(3);
  expect(comp.emojis.length).toBeGreaterThan(0);
  expect(comp.zooms.length).toBeGreaterThan(0);
  expect(comp.sfx.length).toBeGreaterThan(0);
  expect(comp.words.length).toBeGreaterThan(10);
  expect(comp.music).not.toBeNull();
});

describe("projectFromComposition", () => {
  const p = projectFromComposition(comp, info, settings, { file: "chill-1.ogg", title: "Soft Window" });

  it("keeps the cut as clips and the length", () => {
    expect(p.clips.map((c) => [c.sourceIn, c.sourceOut])).toEqual(comp.edl.segments.map((s) => [s.start, s.end]));
    expect(projectDuration(p)).toBeCloseTo(comp.edl.outputDuration, 3);
  });

  it("turns AI cards into text items at their default spots", () => {
    expect(p.texts.map((t) => t.variant)).toEqual(comp.cards.map((c) => c.kind));
    const hook = p.texts.find((t) => t.variant === "hook")!;
    expect(hook).toMatchObject({ text: "24/7 AI editor", accent: "AI", ...DEFAULT_TEXT_POSITION.hook });
  });

  it("brings over captions, stickers, sfx, music and zooms", () => {
    expect(p.captions.enabled).toBe(true);
    expect(p.captions.style).toBe("creator");
    expect(p.captions.groups.flatMap((g) => g.words.map((w) => w.text))).toEqual(comp.words.map((w) => w.word));
    expect(p.captions.groups.every((g) => g.words.length === 1)).toBe(true); // creator = one word at a time
    expect(p.stickers.map((s) => s.emoji)).toEqual(comp.emojis.map((e) => e.emoji));
    expect(p.sfx.map((s) => s.sound)).toEqual(comp.sfx.map((s) => s.sound));
    expect(p.music[0]).toMatchObject({ source: { kind: "bundled", mood: "chill", file: "chill-1.ogg" }, start: 0 });
    expect(p.zooms.length).toBe(comp.zooms.length);
    expect(p.settings).toMatchObject({ preset: "creator", vertical: true, cutZoom: true });
  });
});

describe("projectToComposition", () => {
  it("round-trips the AI's edit unchanged where it matters for rendering", () => {
    const back = projectToComposition(projectFromComposition(comp, info, settings));
    expect(back.edl.segments).toEqual(comp.edl.segments);
    expect(back.edl.outputDuration).toBeCloseTo(comp.edl.outputDuration, 3);
    expect(back.words.map((w) => [w.word, w.start, w.end])).toEqual(comp.words.map((w) => [w.word, w.start, w.end]));
    expect(back.cards.map((c) => [c.kind, c.text, c.start, c.end])).toEqual(comp.cards.map((c) => [c.kind, c.text, c.start, c.end]));
    expect(back.zooms).toEqual(comp.zooms);
    expect(back.sfx.map((s) => [s.sound, s.at])).toEqual(comp.sfx.map((s) => [s.sound, s.at]));
    expect(back.cutZoom).toBe(comp.cutZoom);
    expect(back.caption).toEqual(comp.caption);
  });

  it("feeds the existing renderer", () => {
    const p = projectFromComposition(comp, info, settings);
    p.texts.push(newTextItem(2, 4, "Hello"));
    const back = projectToComposition(splitClip(p, 3));
    expect(back.edl.segments.length).toBe(comp.edl.segments.length + 1);
    const { graph } = buildRenderGraph(back, info, PREVIEW_QUALITY, {
      emojiPaths: back.emojis.map(() => "/e.png"),
      cardPaths: back.cards.map(() => "/c.png"),
      sfxPaths: {},
    });
    expect(graph).toContain("[v]");
    expect(graph).toContain("W*0.500-w/2"); // a plain text item carries its position
  });

  it("leaves captions out when switched off", () => {
    const p = testProject();
    p.captions.enabled = false;
    const back = projectToComposition(p);
    expect(back.words).toEqual([]);
    expect(back.caption).toBeNull();
  });
});

describe("editor store", () => {
  beforeEach(() => useEditorStore.getState().load(testProject()));
  const store = () => useEditorStore.getState();

  it("undoes and redoes edits", () => {
    store().setPlayhead(7);
    store().splitAtPlayhead();
    expect(store().project!.clips).toHaveLength(4);
    editorHistory.undo();
    expect(store().project!.clips).toHaveLength(3);
    editorHistory.redo();
    expect(store().project!.clips).toHaveLength(4);
  });

  it("doesn't record playhead, selection or zoom changes", () => {
    store().setPlayhead(3);
    store().select({ track: "texts", id: "t1" });
    store().setZoom(120);
    expect(editorHistory.canUndo()).toBe(false);
  });

  it("records a whole drag as one step", async () => {
    const { moveItem } = await import("./ops");
    const ref = { track: "texts" as const, id: "t1" };
    store().beginGesture();
    for (const t of [6.2, 6.8, 7.5, 9]) store().apply((p) => moveItem(p, ref, t));
    store().endGesture();
    expect(store().project!.texts[0].start).toBe(9);
    editorHistory.undo();
    expect(store().project!.texts[0].start).toBe(6);
    expect(editorHistory.canUndo()).toBe(false);
  });

  it("splits the selected overlay instead of the clip", () => {
    store().select({ track: "texts", id: "t1" });
    store().setPlayhead(7);
    store().splitAtPlayhead();
    expect(store().project!.texts).toHaveLength(2);
    expect(store().project!.clips).toHaveLength(3);
  });

  it("deletes and duplicates the selection", () => {
    store().select({ track: "stickers", id: "s1" });
    store().duplicateSelected();
    expect(store().project!.stickers).toHaveLength(2);
    expect(store().selection?.id).not.toBe("s1");
    store().deleteSelected();
    expect(store().project!.stickers).toHaveLength(1);
    expect(store().selection).toBeNull();
  });

  it("keeps the playhead inside the video after a delete", () => {
    store().setPlayhead(16);
    store().apply((p) => ({ ...p, clips: p.clips.slice(0, 1) }));
    expect(store().playhead).toBe(5);
  });

  it("caps history at 100 steps", () => {
    for (let i = 0; i < 120; i++) store().apply((p) => ({ ...p, texts: [...p.texts] }));
    expect(useEditorStore.temporal.getState().pastStates.length).toBe(100);
  });
});
