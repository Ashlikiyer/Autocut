import { describe, expect, it } from "vitest";
import type { VideoInfo, Word } from "@/types";
import { PRESETS } from "@/lib/presets";
import { buildEDL } from "./edl";
import type { Composition } from "./compose";
import { buildAss } from "./ass";
import { buildRenderGraph, PREVIEW_QUALITY } from "./filtergraph";

/** Export features the manual editor relies on. */

const info: VideoInfo = { duration: 10, width: 1080, height: 1920, fps: 30, hasAudio: true };
const assets = {
  emojiPaths: [],
  sfxPaths: { pop: "/sfx_pop.ogg" },
  musicPath: "/music.ogg",
};

function comp(over: Partial<Composition> = {}): Composition {
  return {
    edl: buildEDL(10, []),
    vertical: false,
    words: [],
    caption: null,
    hook: null,
    hookFont: "Poppins Black",
    zooms: [],
    flashes: [],
    emojis: [],
    texts: [],
    sfx: [],
    sfxVolume: 0.5,
    music: null,
    progressBar: false,
    colorBoost: false,
    vignette: false,
    accent: "#C8FF2E",
    cards: [],
    cutZoom: false,
    theme: { panel: "#141A26", accent: "#FFC93C", text: "#FFFFFF" },
    effectsLimited: false,
    ...over,
  };
}

const w = (word: string, start: number, end: number): Word => ({ word, start, end });

describe("editor export: music", () => {
  it("keeps the old defaults when the editor set nothing", () => {
    const { graph } = buildRenderGraph(
      comp({ music: { source: "bundled", mood: "upbeat", volume: 0.2 } }),
      info, PREVIEW_QUALITY, assets,
    );
    expect(graph).toContain("atrim=0:10.000,asetpts=N/SR/TB,afade=t=in:d=0.500,afade=t=out:st=8.500:d=1.500,volume=0.20[music]");
    expect(graph).toContain("sidechaincompress");
    expect(graph).not.toContain("adelay=0");
  });

  it("plays only over its span, with the chosen fades", () => {
    const { graph } = buildRenderGraph(
      comp({ music: { source: "bundled", mood: "upbeat", volume: 0.3, start: 2, end: 7, fadeIn: 0, fadeOut: 1, ducking: true } }),
      info, PREVIEW_QUALITY, assets,
    );
    expect(graph).toContain("atrim=0:5.000,asetpts=N/SR/TB,afade=t=out:st=4.000:d=1.000,volume=0.30,adelay=2000:all=1[music]");
    expect(graph).not.toContain("afade=t=in");
  });

  it("skips ducking when it's turned off", () => {
    const { graph } = buildRenderGraph(
      comp({ music: { source: "custom", volume: 0.3, ducking: false } }),
      info, PREVIEW_QUALITY, assets,
    );
    expect(graph).not.toContain("sidechaincompress");
    expect(graph).not.toContain("asplit=2[speech][side]");
    expect(graph).toContain("[speech][music]amix=inputs=2");
  });

  it("drops music whose span is empty", () => {
    const { graph, inputArgs } = buildRenderGraph(
      comp({ music: { source: "custom", volume: 0.3, start: 10, end: 12 } }),
      info, PREVIEW_QUALITY, assets,
    );
    expect(inputArgs).not.toContain("/music.ogg");
    expect(graph).not.toContain("[music]");
  });
});

describe("editor export: sound effects", () => {
  it("applies each cue's own volume", () => {
    const { graph, inputArgs } = buildRenderGraph(
      comp({ sfx: [{ sound: "pop", at: 1 }, { sound: "pop", at: 2, volume: 0.5 }, { sound: "pop", at: 3 }] }),
      info, PREVIEW_QUALITY, assets,
    );
    expect(inputArgs.filter((a) => a === "/sfx_pop.ogg")).toHaveLength(2);
    expect(graph).toContain("volume=0.50,asplit=2");
    expect(graph).toContain("volume=0.25,asplit=1");
    expect(graph).toContain("adelay=2000:all=1");
  });
});

describe("editor export: captions", () => {
  it("uses the editor's caption groups instead of regrouping", () => {
    const words = [w("one", 0, 0.3), w("two", 0.35, 0.6), w("three", 0.65, 0.9)];
    const ass = buildAss({
      width: 1080,
      height: 1920,
      words,
      groups: [[words[0]], [words[1], words[2]]],
      caption: { ...PRESETS.clean.caption, wordHighlight: false, maxWords: 3, uppercase: true },
      texts: [],
    });
    const events = ass.split("\n").filter((l) => l.startsWith("Dialogue"));
    // One event per word; a group never shows words from another group.
    expect(events).toHaveLength(3);
    expect(events[0]).toContain("ONE");
    expect(events[0]).not.toContain("TWO");
    expect(events[1]).toContain("TWO");
    expect(events[1]).toContain("{\\alpha&HFF&}THREE{\\r}");
  });

  it("still hides grouped words behind focus titles", () => {
    const words = [w("hello", 0, 0.3), w("world", 2, 2.3)];
    const ass = buildAss({
      width: 1080,
      height: 1920,
      words,
      groups: [[words[0]], [words[1]]],
      caption: { ...PRESETS.clean.caption, wordHighlight: false, uppercase: true },
      texts: [],
      hideCaptions: [{ start: 1.8, end: 3 }],
    });
    expect(ass).toContain("HELLO");
    expect(ass).not.toContain("WORLD");
  });
});

describe("word-by-word captions", () => {
  const words = [w("make", 1, 1.3), w("money", 1.35, 1.8), w("online", 1.85, 2.3)];
  const ass = buildAss({
    width: 1080,
    height: 1920,
    words,
    caption: { ...PRESETS.energetic.caption, maxWords: 3 },
    texts: [],
  });
  const events = ass.split("\n").filter((l) => l.startsWith("Dialogue"));

  it("shows each word only once it's spoken", () => {
    expect(events).toHaveLength(3);
    // Starts exactly with the first word, not before.
    expect(events[0]).toMatch(/^Dialogue: 0,0:00:01\.00,0:00:01\.35,/);
    // Not-yet-spoken words are invisible (they keep their place in the line).
    expect(events[0]).toContain("{\\alpha&HFF&}MONEY{\\r}");
    expect(events[0]).toContain("{\\alpha&HFF&}ONLINE{\\r}");
    // The current word fades and pops in, highlighted.
    expect(events[1]).toContain("\\t(0,70,\\alpha&H00&)");
    expect(events[1]).toMatch(/\{\\1c&H002EFFC8&\\alpha&HFF&.*\}MONEY/);
    expect(events[2]).not.toContain("{\\alpha&HFF&}");
  });

  it("leaves the screen right after the last word", () => {
    expect(events[2]).toMatch(/^Dialogue: 0,0:00:01\.85,0:00:02\.45,/);
  });
});

describe("captionEnd", () => {
  it("holds briefly after the last word, never into the next chunk", async () => {
    const { captionEnd } = await import("./ass");
    expect(captionEnd([w("hi", 1, 1.4)])).toBeCloseTo(1.55);
    expect(captionEnd([w("hi", 1, 1.4)], 1.45)).toBeCloseTo(1.45);
    // A word Whisper stretched over a long pause doesn't keep the caption up.
    expect(captionEnd([w("so", 1, 4)])).toBeCloseTo(2.35);
  });
});
