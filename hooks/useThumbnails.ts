"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function waitFor(el: HTMLVideoElement, events: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      for (const e of events) el.removeEventListener(e, done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    for (const e of events) el.addEventListener(e, done);
  });
}

/**
 * Lazily grabs small frames from the source video for the timeline's video
 * track, using a hidden <video> and a canvas. Frames are cached by source time
 * (rounded to `granularity` seconds) and generated one at a time.
 */
export function useThumbnails(source: File | null, aspect: number, height = 48, granularity = 0.5) {
  const cache = useRef(new Map<number, string>());
  const queue = useRef<number[]>([]);
  const busy = useRef(false);
  const video = useRef<HTMLVideoElement | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!source) return;
    const url = URL.createObjectURL(source);
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "auto";
    v.src = url;
    video.current = v;
    const thumbs = cache.current;
    return () => {
      video.current = null;
      queue.current = [];
      v.removeAttribute("src");
      URL.revokeObjectURL(url);
      thumbs.clear();
    };
  }, [source]);

  const pump = useCallback(async () => {
    if (busy.current || !video.current) return;
    busy.current = true;
    const width = Math.round(height * aspect);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    try {
      while (queue.current.length && video.current && ctx) {
        const t = queue.current.shift()!;
        if (cache.current.has(t)) continue;
        const v: HTMLVideoElement = video.current;
        // Every wait times out: a <video> replaced mid-wait (e.g. React's
        // double-mount in development) never fires its events.
        if (v.readyState < 1) await waitFor(v, ["loadedmetadata", "error"], 4000);
        if (v !== video.current) {
          // The <video> was replaced: retry this frame on the new one.
          queue.current.unshift(t);
          continue;
        }
        v.currentTime = Math.min(t, Math.max(0, (v.duration || t) - 0.05));
        await waitFor(v, ["seeked", "error"], 4000);
        if (v !== video.current) {
          // The <video> was replaced: retry this frame on the new one.
          queue.current.unshift(t);
          continue;
        }
        if (!v.videoWidth) continue;
        // Centre crop to the timeline tile's shape (matches the export's crop).
        const srcAspect = v.videoWidth / v.videoHeight;
        let sw = v.videoWidth;
        let sh = v.videoHeight;
        if (srcAspect > aspect) sw = sh * aspect;
        else sh = sw / aspect;
        ctx.drawImage(v, (v.videoWidth - sw) / 2, (v.videoHeight - sh) / 2, sw, sh, 0, 0, width, height);
        cache.current.set(t, canvas.toDataURL("image/jpeg", 0.6));
        setVersion((n) => n + 1);
      }
    } finally {
      busy.current = false;
    }
  }, [aspect, height]);

  // Frames may be requested before the hidden <video> exists; start then.
  useEffect(() => {
    if (source) void pump();
  }, [pump, source]);

  /** The thumbnail for a source time, or undefined (and queued) if not ready yet. */
  const get = useCallback(
    (sourceTime: number) => {
      const key = Math.round(sourceTime / granularity) * granularity;
      const hit = cache.current.get(key);
      if (!hit && !queue.current.includes(key)) queue.current.push(key);
      if (!hit) void pump();
      return hit;
    },
    [granularity, pump],
  );

  return { get, version };
}
