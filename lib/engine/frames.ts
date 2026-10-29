import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { deleteFiles, runFFmpeg } from "./render";

export interface Snapshot {
  /** Seconds into the original video. */
  at: number;
  /** For a contact sheet: the time of each frame, left to right, top to bottom. */
  times?: number[];
  /** data:image/jpeg;base64,… */
  image: string;
}

/** Evenly spaced snapshot times, avoiding the very first and last frames. */
export function snapshotTimes(duration: number, count: number): number[] {
  if (duration <= 0) return [];
  const n = Math.max(1, Math.min(count, Math.floor(duration / 1.5) || 1));
  return Array.from({ length: n }, (_, i) => +(((i + 0.5) / n) * duration).toFixed(2));
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(bin);
}

/** Grid for a contact sheet of `n` frames: [columns, rows, frames used]. */
export function sheetLayout(n: number): [number, number, number] {
  if (n >= 6) return [3, 2, 6];
  if (n >= 4) return [2, 2, 4];
  return [Math.max(1, n), 1, Math.max(1, n)];
}

/**
 * Grabs up to 6 small frames and joins them into ONE contact-sheet JPEG, so
 * the AI can see the whole video in a single image (Groq's vision model takes
 * at most 3 images per request). Returns null if no frame could be read.
 */
export async function extractSnapshotSheet(
  ffmpeg: FFmpeg,
  inputPath: string,
  duration: number,
  stallMs?: number,
): Promise<Snapshot | null> {
  const frames: { at: number; path: string }[] = [];
  try {
    for (const [i, at] of snapshotTimes(duration, 6).entries()) {
      const path = `/snap_${i}.png`;
      const { code } = await runFFmpeg(
        ffmpeg,
        ["-hide_banner", "-ss", at.toFixed(2), "-i", inputPath, "-frames:v", "1", "-vf", "scale=240:-2", "-an", "-y", path],
        undefined,
        stallMs,
      );
      if (code === 0) frames.push({ at, path });
    }
    if (!frames.length) return null;

    const [cols, rows, used] = sheetLayout(frames.length);
    const pick = frames.slice(0, used);
    const inputs = pick.flatMap((f) => ["-i", f.path]);
    const rowsGraph = Array.from({ length: rows }, (_, r) => {
      const labels = Array.from({ length: cols }, (_, c) => `[${r * cols + c}]`).join("");
      return cols > 1 ? `${labels}hstack=${cols}[r${r}]` : `${labels}null[r${r}]`;
    });
    const graph =
      rows > 1
        ? `${rowsGraph.join(";")};${Array.from({ length: rows }, (_, r) => `[r${r}]`).join("")}vstack=${rows}[out]`
        : rowsGraph[0].replace("[r0]", "[out]");
    const sheet = "/snap_sheet.jpg";
    const { code } = await runFFmpeg(
      ffmpeg,
      ["-hide_banner", ...inputs, "-filter_complex", graph, "-map", "[out]", "-frames:v", "1", "-q:v", "5", "-y", sheet],
      undefined,
      stallMs,
    );
    if (code !== 0) return null;
    const data = await ffmpeg.readFile(sheet);
    await deleteFiles(ffmpeg, [sheet]);
    if (typeof data === "string" || !data.byteLength) return null;
    return {
      at: pick[0].at,
      times: pick.map((f) => f.at),
      image: `data:image/jpeg;base64,${toBase64(data)}`,
    };
  } finally {
    await deleteFiles(ffmpeg, frames.map((f) => f.path));
  }
}
