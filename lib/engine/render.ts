import type { FFFSType, FFmpeg } from "@ffmpeg/ffmpeg";
import type { VideoInfo } from "@/types";
import { PRESETS } from "@/lib/presets";
import { buildAss } from "./ass";
import { hookDuration, type Composition } from "./compose";
import {
  buildRenderGraph,
  outputSize,
  type RenderAssets,
  type RenderQuality,
} from "./filtergraph";
import { parseLogTime, parseProbeLog } from "./probe";

const INPUT_DIR = "/input";
// FFFSType is a runtime enum, but @ffmpeg/ffmpeg resolves to an empty stub
// during server rendering, so use the string value directly.
const WORKERFS = "WORKERFS" as FFFSType;

export interface RunResult {
  code: number;
  log: string[];
}

/**
 * Thrown when ffmpeg stops logging for too long. The multithreaded core can
 * deadlock; the caller should terminate the worker and retry single-threaded.
 */
export class FFmpegStalledError extends Error {
  constructor(seconds: number) {
    super(`ffmpeg produced no output for ${seconds} s`);
  }
}

/** Runs one ffmpeg command, collecting its log lines. */
export async function runFFmpeg(
  ffmpeg: FFmpeg,
  args: string[],
  onLog?: (line: string) => void,
  stallMs?: number,
): Promise<RunResult> {
  const log: string[] = [];
  let lastLog = Date.now();
  const handler = ({ message }: { message: string }) => {
    lastLog = Date.now();
    log.push(message);
    onLog?.(message);
  };
  ffmpeg.on("log", handler);
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    const exec = ffmpeg.exec(args);
    if (!stallMs) return { code: await exec, log };
    const stalled = new Promise<never>((_, reject) => {
      timer = setInterval(() => {
        if (Date.now() - lastLog > stallMs) {
          reject(new FFmpegStalledError(Math.round(stallMs / 1000)));
        }
      }, 2000);
    });
    return { code: await Promise.race([exec, stalled]), log };
  } finally {
    clearInterval(timer);
    ffmpeg.off("log", handler);
  }
}

/**
 * Makes the user's file readable by ffmpeg without copying it into wasm
 * memory (WORKERFS reads straight from the File object).
 */
export async function mountInput(ffmpeg: FFmpeg, file: File): Promise<string> {
  await unmountInput(ffmpeg);
  await ffmpeg.createDir(INPUT_DIR);
  await ffmpeg.mount(WORKERFS, { files: [file] }, INPUT_DIR);
  return `${INPUT_DIR}/${file.name}`;
}

export async function unmountInput(ffmpeg: FFmpeg) {
  try {
    await ffmpeg.unmount(INPUT_DIR);
  } catch {
    // not mounted
  }
  try {
    await ffmpeg.deleteDir(INPUT_DIR);
  } catch {
    // doesn't exist
  }
}

export async function deleteFiles(ffmpeg: FFmpeg, paths: string[]) {
  for (const p of paths) {
    try {
      await ffmpeg.deleteFile(p);
    } catch {
      // already gone
    }
  }
}

/** Reads duration, resolution, frame rate and audio presence. */
export async function probeVideo(
  ffmpeg: FFmpeg,
  inputPath: string,
): Promise<VideoInfo> {
  // With no output file ffmpeg exits with an error after printing the
  // stream summary, which is all we need.
  const { log } = await runFFmpeg(ffmpeg, ["-hide_banner", "-i", inputPath]);
  return parseProbeLog(log);
}

export interface RenderOptions {
  quality: RenderQuality;
  /** x264 preset: "ultrafast" for previews and exports in wasm. */
  x264Preset: "ultrafast" | "superfast" | "veryfast";
  crf: number;
  /** Fonts, emoji, SFX and music already written to ffmpeg's FS. */
  assets: Omit<RenderAssets, "assPath">;
  onProgress?: (ratio: number) => void;
  /** Reject with FFmpegStalledError after this long without log output. */
  stallMs?: number;
}

/** Renders a composition (cuts + captions + effects + audio) to an MP4. */
export async function renderEdit(
  ffmpeg: FFmpeg,
  inputPath: string,
  info: VideoInfo,
  comp: Composition,
  opts: RenderOptions,
): Promise<Uint8Array> {
  const graphPath = "/graph.txt";
  const assPath = "/captions.ass";
  const outPath = "/output.mp4";

  const [W, H] = outputSize(info, opts.quality, comp.vertical);
  const hasText = comp.words.length > 0 || Boolean(comp.hook) || comp.texts.length > 0;
  if (hasText) {
    const caption = comp.caption ?? PRESETS.clean.caption;
    await ffmpeg.writeFile(
      assPath,
      buildAss({
        width: W,
        height: H,
        words: comp.words,
        groups: comp.captionGroups,
        caption,
        hook: comp.hook
          ? { text: comp.hook, font: comp.hookFont, color: comp.accent, duration: hookDuration(comp) }
          : undefined,
        texts: comp.texts,
        hideCaptions: comp.cards.filter((c) => c.kind === "focus"),
      }),
    );
  }
  const { inputArgs, graph } = buildRenderGraph(comp, info, opts.quality, {
    ...opts.assets,
    assPath: hasText ? assPath : undefined,
  });
  await ffmpeg.writeFile(graphPath, graph);

  const total = comp.edl.outputDuration;
  const { code, log } = await runFFmpeg(
    ffmpeg,
    [
      "-hide_banner",
      "-i", inputPath,
      ...inputArgs,
      "-filter_complex_script", graphPath,
      "-map", "[v]",
      "-map", "[a]",
      "-c:v", "libx264",
      "-preset", opts.x264Preset,
      "-crf", String(opts.crf),
      "-c:a", "aac",
      "-b:a", "160k",
      "-movflags", "+faststart",
      "-t", total.toFixed(3),
      "-y", outPath,
    ],
    (line) => {
      const t = parseLogTime(line);
      if (t !== null && total > 0) opts.onProgress?.(Math.min(1, t / total));
    },
    opts.stallMs,
  );

  try {
    if (code !== 0) {
      throw new Error(`Render failed (code ${code}): ${log.slice(-5).join(" | ")}`);
    }
    const data = await ffmpeg.readFile(outPath);
    if (typeof data === "string") throw new Error("Unexpected render output");
    opts.onProgress?.(1);
    return data;
  } finally {
    await deleteFiles(ffmpeg, [graphPath, outPath, assPath]);
  }
}
