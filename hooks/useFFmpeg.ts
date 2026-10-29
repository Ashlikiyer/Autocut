"use client";

import { useEffect, useState } from "react";
import type { FFmpeg } from "@ffmpeg/ffmpeg";

let instance: Promise<FFmpeg> | null = null;
let singleThreadOnly = false;
let mode: "multithread" | "single" | null = null;

/** Which ffmpeg core is loaded (null until loaded). */
export const engineMode = () => mode;

/** True when the page can use SharedArrayBuffer (COOP/COEP headers are live). */
export function canUseMultithread(): boolean {
  return (
    typeof window !== "undefined" &&
    window.crossOriginIsolated === true &&
    typeof SharedArrayBuffer !== "undefined"
  );
}

async function create(multithread: boolean): Promise<FFmpeg> {
  const base = `${window.location.origin}/ffmpeg`;
  // Load the ffmpeg.wasm class from our self-hosted copy (public/ffmpeg,
  // see scripts/copy-ffmpeg.mjs) instead of bundling it: its
  // `new Worker(new URL(...))` call can't be resolved by Turbopack, and served
  // as-is it finds worker.js next to itself.
  const { FFmpeg } = (await import(
    /* webpackIgnore: true */ /* turbopackIgnore: true */ `${base}/class/index.js`
  )) as typeof import("@ffmpeg/ffmpeg");
  const ffmpeg = new FFmpeg();
  const core = multithread ? `${base}/mt` : `${base}/st`;
  await ffmpeg.load({
    coreURL: `${core}/ffmpeg-core.js`,
    wasmURL: `${core}/ffmpeg-core.wasm`,
    ...(multithread ? { workerURL: `${core}/ffmpeg-core.worker.js` } : {}),
  });
  return ffmpeg;
}

/** Loads ffmpeg.wasm once and reuses it for every video. */
export function loadFFmpeg(): Promise<FFmpeg> {
  instance ??= (async () => {
    if (canUseMultithread() && !singleThreadOnly) {
      try {
        const ff = await create(true);
        mode = "multithread";
        console.info("[ffmpeg] loaded multithreaded core");
        return ff;
      } catch (err) {
        console.warn("[ffmpeg] multithreaded core failed, using single-threaded", err);
      }
    }
    const ff = await create(false);
    mode = "single";
    console.info("[ffmpeg] loaded single-threaded core");
    return ff;
  })().catch((err) => {
    instance = null;
    throw err;
  });
  return instance;
}

/**
 * Replaces a stalled multithreaded engine with the single-threaded one for
 * the rest of the session.
 */
export async function fallBackToSingleThread(): Promise<FFmpeg> {
  singleThreadOnly = true;
  await terminateFFmpeg();
  return loadFFmpeg();
}

/** Stops any running command. The next loadFFmpeg() starts a fresh worker. */
export async function terminateFFmpeg() {
  const current = instance;
  instance = null;
  mode = null;
  if (!current) return;
  try {
    (await current).terminate();
  } catch {
    // never loaded
  }
}

export type FFmpegStatus = "idle" | "loading" | "ready" | "error";

/** Starts loading ffmpeg.wasm in the background as soon as it's mounted. */
export function useFFmpeg(preload = true) {
  const [status, setStatus] = useState<FFmpegStatus>("idle");

  useEffect(() => {
    if (!preload) return;
    let active = true;
    // Defer so the state update isn't synchronous inside the effect.
    queueMicrotask(() => active && setStatus("loading"));
    loadFFmpeg().then(
      () => active && setStatus("ready"),
      () => active && setStatus("error"),
    );
    return () => {
      active = false;
    };
  }, [preload]);

  return { status, load: loadFFmpeg };
}
