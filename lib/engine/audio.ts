import type { FFmpeg } from "@ffmpeg/ffmpeg";
import type { TimeRange } from "@/types";
import { LIMITS, SILENCE } from "@/lib/limits";
import { parseSilenceDetect } from "./cuts";
import { deleteFiles, runFFmpeg } from "./render";

export interface AudioChunk {
  index: number;
  offsetSec: number;
  data: Uint8Array;
  mime: string;
  name: string;
}

export interface ExtractedAudio {
  chunks: AudioChunk[];
  /** Silences found by ffmpeg's silencedetect during extraction. */
  silences: TimeRange[];
}

const ENCODINGS = [
  // Opus at 24 kbps: ~1.8 MB for 10 minutes.
  { ext: "ogg", mime: "audio/ogg", args: ["-c:a", "libopus", "-b:a", "24k"] },
  // Fallback if the core was built without libopus.
  { ext: "mp3", mime: "audio/mpeg", args: ["-c:a", "libmp3lame", "-b:a", "32k"] },
];

/**
 * Splits [0, duration) into chunks so each is about `targetBytes`, assuming a
 * constant bitrate.
 */
export function planChunks(
  totalBytes: number,
  duration: number,
  targetBytes: number = LIMITS.targetAudioChunkBytes,
): TimeRange[] {
  if (totalBytes <= targetBytes || duration <= 0) {
    return [{ start: 0, end: duration }];
  }
  const count = Math.ceil(totalBytes / targetBytes);
  const len = duration / count;
  return Array.from({ length: count }, (_, i) => ({
    start: i * len,
    end: i === count - 1 ? duration : (i + 1) * len,
  }));
}

/**
 * Extracts mono 16 kHz compressed audio for transcription, runs silencedetect
 * in the same pass, and splits the result into chunks under the upload limit.
 */
export async function extractAudio(
  ffmpeg: FFmpeg,
  inputPath: string,
  duration: number,
  stallMs?: number,
): Promise<ExtractedAudio> {
  for (const enc of ENCODINGS) {
    const full = `/audio.${enc.ext}`;
    const { code, log } = await runFFmpeg(ffmpeg, [
      "-hide_banner",
      "-i", inputPath,
      "-map", "0:a:0",
      "-vn",
      "-ac", "1",
      "-ar", "16000",
      "-af", `silencedetect=noise=${SILENCE.noiseDb}dB:d=${SILENCE.detectDuration}`,
      ...enc.args,
      "-y", full,
    ], undefined, stallMs);
    if (code !== 0) {
      await deleteFiles(ffmpeg, [full]);
      continue;
    }

    const silences = parseSilenceDetect(log, duration);
    const data = await ffmpeg.readFile(full);
    if (typeof data === "string") throw new Error("Unexpected audio output");

    const ranges = planChunks(data.byteLength, duration);
    if (ranges.length === 1) {
      await deleteFiles(ffmpeg, [full]);
      return {
        silences,
        chunks: [
          { index: 0, offsetSec: 0, data, mime: enc.mime, name: `chunk-0.${enc.ext}` },
        ],
      };
    }

    const chunks: AudioChunk[] = [];
    for (const [index, r] of ranges.entries()) {
      const name = `chunk-${index}.${enc.ext}`;
      const path = `/${name}`;
      const res = await runFFmpeg(ffmpeg, [
        "-hide_banner",
        "-ss", r.start.toFixed(3),
        "-t", (r.end - r.start).toFixed(3),
        "-i", full,
        "-c", "copy",
        "-y", path,
      ]);
      if (res.code !== 0) throw new Error(`Audio chunk ${index} failed`);
      const chunk = await ffmpeg.readFile(path);
      await deleteFiles(ffmpeg, [path]);
      if (typeof chunk === "string") throw new Error("Unexpected chunk output");
      chunks.push({ index, offsetSec: r.start, data: chunk, mime: enc.mime, name });
    }
    await deleteFiles(ffmpeg, [full]);
    return { chunks, silences };
  }
  throw new Error("Could not extract audio from this video");
}
