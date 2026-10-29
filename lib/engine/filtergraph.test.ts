import { describe, expect, it } from "vitest";
import type { EditSettings, VideoInfo } from "@/types";
import { buildEDL } from "./edl";
import { composeEdit, type Composition } from "./compose";
import {
  buildRenderGraph,
  FINAL_QUALITY,
  outputFps,
  outputSize,
  PREVIEW_QUALITY,
  selectExpression,
} from "./filtergraph";
import { planChunks } from "./audio";
import { parseLogTime, parseProbeLog } from "./probe";

const info: VideoInfo = { duration: 10, width: 1920, height: 1080, fps: 59.94, hasAudio: true };
const noAssets = { emojiPaths: [], sfxPaths: {} };

function plainComp(over: Partial<Composition> = {}): Composition {
  return {
    edl: buildEDL(10, [{ start: 2, end: 3.5 }]),
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

describe("filter graph", () => {
  it("selects kept segments with half-open ranges", () => {
    expect(selectExpression(buildEDL(10, [{ start: 2, end: 3.5 }]))).toBe(
      "gte(t,0.000)*lt(t,2.000)+gte(t,3.500)*lt(t,10.000)",
    );
  });

  it("builds a plain cut graph with labelled outputs", () => {
    const { graph, inputArgs } = buildRenderGraph(plainComp(), info, PREVIEW_QUALITY, noAssets);
    expect(inputArgs).toEqual([]);
    expect(graph).toContain("[0:v]fps=30,select='");
    expect(graph).toContain("setpts=N/FRAME_RATE/TB");
    expect(graph).toContain("scale=854:480:flags=fast_bilinear");
    expect(graph).toMatch(/\[speech\]alimiter=limit=0\.95,aformat=sample_fmts=fltp:channel_layouts=stereo\[a\]$/);
  });

  it("adds crop, zoom, flash, captions, emoji, sfx and ducked music", () => {
    const comp = plainComp({
      vertical: true,
      zooms: [{ start: 1, end: 2, scale: 1.2, shake: true, style: "punch" }],
      flashes: [4],
      emojis: [{ emoji: "🔥", start: 3, end: 4 }],
      sfx: [{ sound: "pop", at: 3 }, { sound: "pop", at: 5 }, { sound: "whoosh", at: 3.85 }],
      music: { source: "bundled", mood: "upbeat", volume: 0.14 },
      progressBar: true,
      colorBoost: true,
      vignette: true,
    });
    const { graph, inputArgs } = buildRenderGraph(comp, info, FINAL_QUALITY, {
      assPath: "/captions.ass",
      fontsDir: "/fonts",
      emojiPaths: ["/emoji_0.png"],
      sfxPaths: { pop: "/sfx_pop.ogg", whoosh: "/sfx_whoosh.ogg" },
      musicPath: "/music.ogg",
    });
    expect(inputArgs).toEqual([
      "-i", "/emoji_0.png",
      "-stream_loop", "-1", "-i", "/music.ogg",
      "-i", "/sfx_pop.ogg",
      "-i", "/sfx_whoosh.ogg",
    ]);
    expect(graph).toContain("crop=w='min(iw,ih*9/16)'");
    expect(graph).toContain("zoompan=z='1+between((in/30),1.000,2.000)*0.200");
    expect(graph).toContain("s=1080x1920");
    expect(graph).toContain("eq=brightness=");
    expect(graph).toContain("eq=saturation=1.3:contrast=1.06");
    expect(graph).toContain("vignette=angle=PI/6");
    expect(graph).toContain("subtitles=filename=/captions.ass:fontsdir=/fonts");
    expect(graph).toContain("[1:v]format=rgba");
    expect(graph).toContain("eof_action=repeat");
    expect(graph).toContain("drawbox=");
    expect(graph).toContain("[2:a]");
    expect(graph).toContain("sidechaincompress");
    expect(graph).toContain("asplit=2[s0][s1]");
    expect(graph).toContain("adelay=5000:all=1");
    expect(graph).toContain("amix=inputs=5:normalize=0");
    expect(graph).toContain("loudnorm=I=-14");
  });

  it("caps fps and falls back when unknown", () => {
    expect(outputFps({ fps: 24 }, PREVIEW_QUALITY)).toBe(24);
    expect(outputFps({ fps: 0 }, PREVIEW_QUALITY)).toBe(30);
    expect(outputFps(info, FINAL_QUALITY)).toBe(30);
  });

  it("sizes output, honoring rotation and never upscaling", () => {
    expect(outputSize(info, FINAL_QUALITY, false)).toEqual([1920, 1080]);
    expect(outputSize(info, PREVIEW_QUALITY, false)).toEqual([854, 480]);
    expect(outputSize({ ...info, rotation: -90 }, PREVIEW_QUALITY, false)).toEqual([480, 854]);
    expect(outputSize({ ...info, width: 640, height: 360 }, FINAL_QUALITY, false)).toEqual([640, 360]);
    expect(outputSize(info, FINAL_QUALITY, true)).toEqual([1080, 1920]);
  });

  it("refuses an empty EDL", () => {
    expect(() =>
      buildRenderGraph(plainComp({ edl: buildEDL(1, [{ start: 0, end: 1 }]) }), info, PREVIEW_QUALITY, noAssets),
    ).toThrow();
  });

  it("renders a composed edit's graph end to end", () => {
    const settings: EditSettings = {
      auto: false, shareFrames: false, silenceThreshold: 0.5, language: "auto", preset: "energetic", captions: true,
      captionStyle: "energetic", removeFillers: true, verticalCrop: true, effects: ["zoom", "shake", "emoji", "text", "transitions", "sfx", "hook", "progress", "colorBoost", "vignette"], intensity: "normal", music: "none",
    };
    const words = [
      { word: "hello", start: 0.1, end: 0.5 },
      { word: "world", start: 2, end: 2.5 },
    ];
    const comp = composeEdit({ words, silences: [], info, settings, plan: null });
    expect(() => buildRenderGraph(comp, info, PREVIEW_QUALITY, noAssets)).not.toThrow();
  });
});

describe("probe parsing", () => {
  it("reads duration, size, fps and audio", () => {
    const log = [
      "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from '/input/a.mp4':",
      "  Duration: 00:03:04.20, start: 0.000000, bitrate: 1234 kb/s",
      "  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1920x1080 [SAR 1:1 DAR 16:9], 4000 kb/s, 29.97 fps, 29.97 tbr, 30k tbn (default)",
      "  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s (default)",
    ];
    expect(parseProbeLog(log)).toEqual({
      duration: 184.2,
      width: 1920,
      height: 1080,
      fps: 29.97,
      hasAudio: true,
    });
  });

  it("reads rotation metadata", () => {
    expect(parseProbeLog(["    displaymatrix: rotation of -90.00 degrees"]).rotation).toBe(-90);
    expect(parseProbeLog(["      rotate          : 90"]).rotation).toBe(90);
  });

  it("detects a missing audio stream", () => {
    const parsed = parseProbeLog([
      "  Duration: 00:00:20.00, start: 0.000000",
      "  Stream #0:0: Video: vp9, yuv420p, 720x1280, 30 fps",
    ]);
    expect(parsed.hasAudio).toBe(false);
    expect(parsed.height).toBe(1280);
  });

  it("reads progress time", () => {
    expect(parseLogTime("frame=  120 fps= 30 time=00:01:02.50 bitrate=")).toBe(62.5);
    expect(parseLogTime("nothing here")).toBeNull();
  });
});

describe("planChunks", () => {
  it("keeps small audio in one chunk", () => {
    expect(planChunks(1_000_000, 600, 3_500_000)).toEqual([{ start: 0, end: 600 }]);
  });

  it("splits large audio into evenly sized chunks covering the whole duration", () => {
    const chunks = planChunks(9_000_000, 900, 3_500_000);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual({ start: 0, end: 300 });
    expect(chunks[2].end).toBe(900);
  });
});
