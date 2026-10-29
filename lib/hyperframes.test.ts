import { describe, expect, it } from "vitest";
import type { VideoInfo } from "@/types";
import { buildEDL } from "./engine/edl";
import type { Composition } from "./engine/compose";
import { buildRenderGraph, PREVIEW_QUALITY } from "./engine/filtergraph";
import { overlayKey } from "./overlay-client";

const info: VideoInfo = { duration: 20, width: 720, height: 1280, fps: 30, hasAudio: true };
const comp = {
  edl: buildEDL(20, []), vertical: true, words: [], caption: null, hook: null, hookFont: "Poppins Black",
  zooms: [], flashes: [], emojis: [], texts: [], sfx: [], sfxVolume: 0.4, music: null, progressBar: false,
  colorBoost: false, vignette: false, accent: "#FFC93C", cutZoom: false, effectsLimited: false,
  theme: { panel: "#141A26", accent: "#FFC93C", text: "#FFFFFF" },
  cards: [
    { kind: "hook", start: 0.1, end: 3, text: "24/7 AI editor", accent: "AI", sticker: "NO COURSE" },
    { kind: "step", start: 6, end: 9.2, text: "Download Claude", label: "STEP 1" },
  ],
} as Composition;

describe("HyperFrames card overlay", () => {
  it("composites each card as its own seeked, alpha-decoded slice", () => {
    const { graph, inputArgs } = buildRenderGraph(comp, info, PREVIEW_QUALITY, {
      emojiPaths: [], sfxPaths: {}, cardPaths: ["/a.png", "/b.png"],
      cardOverlay: { path: "/cards_overlay.webm", segments: [{ offset: 0, duration: 2.9 }, { offset: 3, duration: 3.2 }] },
    });
    expect(inputArgs).toEqual([
      "-ss", "0.000", "-t", "2.900", "-c:v", "libvpx-vp9", "-i", "/cards_overlay.webm",
      "-ss", "3.000", "-t", "3.200", "-c:v", "libvpx-vp9", "-i", "/cards_overlay.webm",
    ]);
    expect(graph).toContain("[1:v]format=rgba,scale=360:640,setpts=PTS-STARTPTS+0.100/TB[hf0]");
    expect(graph).toContain("enable='between(t,6.000,9.200)'");
    expect(graph).not.toContain("-loop"); // the PNG path is skipped
  });

  it("falls back to PNG cards when segments don't match", () => {
    const { inputArgs } = buildRenderGraph(comp, info, PREVIEW_QUALITY, {
      emojiPaths: [], sfxPaths: {}, cardPaths: ["/a.png", "/b.png"],
      cardOverlay: { path: "/x.webm", segments: [{ offset: 0, duration: 2 }] },
    });
    expect(inputArgs.filter((a) => a.endsWith(".png"))).toHaveLength(2);
  });

  it("reuses an overlay only for the same cards and size", () => {
    expect(overlayKey(comp, 1080, 1920)).toBe(overlayKey(comp, 1080, 1920));
    expect(overlayKey(comp, 1080, 1920)).not.toBe(overlayKey(comp, 720, 1280));
    const changed = { ...comp, cards: [{ ...comp.cards[0], text: "Different" }, comp.cards[1]] } as Composition;
    expect(overlayKey(changed, 1080, 1920)).not.toBe(overlayKey(comp, 1080, 1920));
  });
});

describe("cached HyperFrames overlay", () => {
  it("survives being written to ffmpeg more than once (re-render, download)", async () => {
    const { prepareAssets } = await import("./engine/assets");
    // Like ffmpeg.wasm: writeFile transfers (detaches) the buffer it gets.
    const written: number[] = [];
    const ffmpeg = {
      writeFile: async (_path: string, data: Uint8Array) => {
        const moved = structuredClone(data, { transfer: [data.buffer] });
        written.push(moved.byteLength);
      },
    } as unknown as import("@ffmpeg/ffmpeg").FFmpeg;
    const overlay = {
      webm: new Uint8Array([1, 2, 3, 4]),
      segments: [{ offset: 0, duration: 2.9 }, { offset: 3, duration: 3.2 }],
      width: 1080,
      height: 1920,
      renderSeconds: 1,
    };
    const visualOnly = { ...comp, cards: comp.cards.map((c) => ({ ...c })), sfx: [], music: null };
    await prepareAssets(ffmpeg, visualOnly, null, overlay);
    await prepareAssets(ffmpeg, visualOnly, null, overlay);
    expect(written).toEqual([4, 4]);
    expect(overlay.webm.byteLength).toBe(4);
  });
});
