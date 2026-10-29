"use client";

import { useEffect, useState } from "react";
import { computePeaks } from "@/lib/editor/timeline";

/** Peaks per second of audio stored for waveforms. */
export const PEAKS_PER_SECOND = 100;

const peaksCache = new Map<string, Promise<Float32Array>>();
let decoder: AudioContext | null = null;

/** Loads and decodes audio once, then caches its waveform peaks by key. */
export function loadPeaks(key: string, load: () => Promise<ArrayBuffer>): Promise<Float32Array> {
  let p = peaksCache.get(key);
  if (!p) {
    p = (async () => {
      decoder ??= new AudioContext();
      const buffer = await decoder.decodeAudioData(await load());
      return computePeaks(buffer.getChannelData(0), buffer.sampleRate, PEAKS_PER_SECOND);
    })();
    peaksCache.set(key, p);
    p.catch(() => peaksCache.delete(key));
  }
  return p;
}

/** Waveform peaks for a bundled sound/music URL or a user's file. */
export function useWaveform(src: { url: string } | { file: File } | null): Float32Array | null {
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const key = src ? ("url" in src ? src.url : `file:${src.file.name}:${src.file.size}`) : null;
  useEffect(() => {
    if (!src || !key) return;
    let alive = true;
    loadPeaks(key, () =>
      "url" in src ? fetch(src.url).then((r) => r.arrayBuffer()) : src.file.arrayBuffer(),
    ).then(
      (p) => alive && setPeaks(p),
      () => alive && setPeaks(null),
    );
    return () => {
      alive = false;
    };
    // `key` identifies `src`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return key ? peaks : null;
}
