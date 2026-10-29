import { describe, expect, it } from "vitest";
import { addAsset, setCaptions, textForPreset, updateSettings } from "./add";
import { testProject } from "./fixtures";
import { itemSpan } from "./ops";

describe("adding assets", () => {
  it("adds text presets at the playhead", () => {
    const { project, ref } = addAsset(testProject(), { kind: "text", preset: "title" }, 4);
    expect(itemSpan(project, ref!)).toEqual({ start: 4, end: 7 });
    expect(project.texts.at(-1)).toMatchObject({ variant: "plain", text: "YOUR TITLE", size: 0.1 });
    expect(textForPreset(testProject(), "step", 2)).toMatchObject({ variant: "step", label: "STEP 1", x: 0.5, y: 0.11 });
  });

  it("keeps new items inside the video", () => {
    const { project, ref } = addAsset(testProject(), { kind: "sticker", emoji: "🔥" }, 16.8); // video is 17 s
    expect(itemSpan(project, ref!)).toEqual({ start: 15.5, end: 17 });
  });

  it("adds sound effects with their real length", () => {
    const { project } = addAsset(testProject(), { kind: "sfx", sound: "ding" }, 3);
    expect(project.sfx.at(-1)).toMatchObject({ sound: "ding", start: 3, duration: 1.2, volume: 1 });
  });

  it("replaces the music bed but keeps its settings", () => {
    const p = testProject();
    p.music[0].volume = 0.2;
    p.music[0].end = 10;
    const { project } = addAsset(p, { kind: "music", mood: "upbeat", file: "upbeat-1.ogg", title: "Bright Steps" }, 0);
    expect(project.music).toHaveLength(1);
    expect(project.music[0]).toMatchObject({ source: { file: "upbeat-1.ogg" }, volume: 0.2, end: 10 });
    const custom = addAsset(project, { kind: "custom-music", name: "song.mp3" }, 0).project;
    expect(custom.music[0].source).toEqual({ kind: "custom", name: "song.mp3" });
  });

  it("adds zooms and transitions", () => {
    const z = addAsset(testProject(), { kind: "zoom", style: "slow" }, 5).project.zooms.at(-1);
    expect(z).toMatchObject({ start: 5, end: 8, scale: 1.08, style: "slow", shake: false });
    const tr = addAsset(testProject(), { kind: "transition" }, 30).project.transitions.at(-1);
    expect(tr?.at).toBe(16.8);
  });

  it("updates settings and captions", () => {
    expect(updateSettings(testProject(), { vignette: true }).settings.vignette).toBe(true);
    const c = setCaptions(testProject(), { enabled: false, style: "clean" }).captions;
    expect(c).toMatchObject({ enabled: false, style: "clean" });
    expect(c.groups).toHaveLength(2);
  });
});
