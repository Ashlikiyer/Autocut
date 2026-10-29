import { LIMITS } from "@/lib/limits";

export interface CheckedVideo {
  file: File;
  /** Seconds, from the browser's metadata (0 if the browser can't read it). */
  duration: number;
  /** Display size from the browser's metadata (0 if unknown). */
  width: number;
  height: number;
}

export class VideoCheckError extends Error {}

const mb = (bytes: number) => Math.round(bytes / (1024 * 1024));

export function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function hasAcceptedType(file: File) {
  const name = file.name.toLowerCase();
  return (
    (LIMITS.acceptedVideoTypes as readonly string[]).includes(file.type) ||
    LIMITS.acceptedVideoExtensions.some((ext) => name.endsWith(ext))
  );
}

interface Meta {
  duration: number;
  width: number;
  height: number;
}

/** Reads duration and size from the file's metadata using a <video> element. */
function readMeta(file: File): Promise<Meta> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const done = (m: Meta) => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      resolve({ ...m, duration: Number.isFinite(m.duration) ? m.duration : 0 });
    };
    const empty = { duration: 0, width: 0, height: 0 };
    const timer = setTimeout(() => done(empty), 8000);
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      done({ duration: video.duration, width: video.videoWidth, height: video.videoHeight });
    };
    // Some codecs (e.g. HEVC in .mov) can't be read by every browser; ffmpeg
    // will check the real duration later.
    video.onerror = () => {
      clearTimeout(timer);
      done(empty);
    };
    video.src = url;
  });
}

/** Checks format, size and length before anything is processed. */
export async function checkVideo(file: File): Promise<CheckedVideo> {
  if (!hasAcceptedType(file)) {
    throw new VideoCheckError("Please upload an MP4, MOV or WebM video.");
  }
  if (file.size > LIMITS.maxFileBytes) {
    throw new VideoCheckError(
      `This file is ${mb(file.size)} MB. The limit is ${mb(LIMITS.maxFileBytes)} MB — trim or compress it first.`,
    );
  }
  const { duration, width, height } = await readMeta(file);
  if (duration > LIMITS.maxVideoSeconds) {
    throw new VideoCheckError(
      `This video is ${formatDuration(duration)} long. The limit is 15 minutes — trim it first.`,
    );
  }
  return { file, duration, width, height };
}
