import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOverlayHtml, overlayJobSchema, type OverlayJob } from "./overlay.ts";
import { buildCardsHtml, cardsJobSchema, type Segment } from "./cards.ts";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/**
 * FFmpeg + FFprobe for HyperFrames' encoder. A system install wins; otherwise
 * the bundled static builds are put on PATH so `npm start` works anywhere.
 */
function bundledBinDirs(): string[] {
  const dirs: string[] = [];
  try {
    dirs.push(dirname(require("ffmpeg-static") as string));
  } catch {
    // not installed
  }
  try {
    dirs.push(dirname((require("ffprobe-static") as { path: string }).path));
  } catch {
    // not installed
  }
  return dirs;
}
const PATH_SEP = process.platform === "win32" ? ";" : ":";
const PATH_WITH_FFMPEG = [process.env.PATH ?? "", ...bundledBinDirs()].filter(Boolean).join(PATH_SEP);
const CLI = join(here, "..", "node_modules", "hyperframes", "bin", "hyperframes.mjs");
/** Caption fonts, shared with the web app. */
const FONTS_DIR = process.env.AUTOCUT_FONTS_DIR ?? join(here, "..", "..", "public", "fonts");
const FONTS = [
  "Poppins-SemiBold.ttf",
  "Poppins-Bold.ttf",
  "Poppins-ExtraBold.ttf",
  "Poppins-Black.ttf",
  "Bangers-Regular.ttf",
  "Anton-Regular.ttf",
];

export interface RenderResult {
  webm: Buffer;
  seconds: number;
}

/** Renders a HyperFrames composition (one HTML file) to transparent WebM. */
async function renderHtml(html: string, fps: number): Promise<RenderResult> {
  const dir = await mkdtemp(join(tmpdir(), "autocut-overlay-"));
  const started = Date.now();
  try {
    await mkdir(join(dir, "assets", "fonts"), { recursive: true });
    await Promise.all(FONTS.map((f) => copyFile(join(FONTS_DIR, f), join(dir, "assets", "fonts", f))));
    await writeFile(join(dir, "index.html"), html);
    const out = join(dir, "overlay.webm");
    await run(process.execPath, [
      CLI, "render", dir,
      "--format", "webm",
      "--fps", String(fps),
      "--quality", "draft",
      "--output", out,
      "--quiet",
    ]);
    return { webm: await readFile(out), seconds: (Date.now() - started) / 1000 };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Renders a full-length overlay job (captions, titles, pops, emoji). */
export async function renderOverlay(input: unknown): Promise<RenderResult> {
  const job: OverlayJob = overlayJobSchema.parse(input);
  return renderHtml(buildOverlayHtml(job), job.fps);
}

/** Renders only the hero cards, back to back; `segments` says where each one is. */
export async function renderCards(input: unknown): Promise<RenderResult & { segments: Segment[] }> {
  const job = cardsJobSchema.parse(input);
  const { html, segments } = buildCardsHtml(job);
  return { ...(await renderHtml(html, job.fps)), segments };
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env: {
        ...process.env,
        PATH: PATH_WITH_FFMPEG,
        // No anonymous usage reporting from our servers.
        HYPERFRAMES_NO_TELEMETRY: "1",
        HF_CLI_TELEMETRY_DISABLED: "1",
        DO_NOT_TRACK: "1",
        HYPERFRAMES_SKIP_SKILLS: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    child.stdout.on("data", (d) => (log += d));
    child.stderr.on("data", (d) => (log += d));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`hyperframes render failed (${code}):\n${log.slice(-2000)}`)),
    );
  });
}
