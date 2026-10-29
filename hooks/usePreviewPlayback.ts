"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Composition } from "@/lib/engine/compose";
import type { Project } from "@/lib/editor/project";
import { clipAt, outputToSource, projectDuration } from "@/lib/editor/ops";
import { DUCK_LEVEL, musicGainAt, speechRanges } from "@/lib/editor/preview";
import { useEditorStore } from "@/lib/editor/store";

/**
 * Plays a Project without rendering: one <video> seeks between clips while
 * Web Audio plays the sound effects and music in sync (with fades and
 * ducking under speech). The audio clock is the master; the video follows it.
 */

/** Video drift (seconds) we tolerate before re-seeking. */
const MAX_DRIFT = 0.25;

const bufferCache = new Map<string, Promise<AudioBuffer>>();

async function loadBuffer(ctx: AudioContext, key: string, load: () => Promise<ArrayBuffer>) {
  let p = bufferCache.get(key);
  if (!p) {
    p = load().then((data) => ctx.decodeAudioData(data));
    bufferCache.set(key, p);
    p.catch(() => bufferCache.delete(key));
  }
  return p;
}

export function usePreviewPlayback(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  project: Project | null,
  comp: Composition | null,
  customMusic: File | null,
) {
  const [playing, setPlaying] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const sources = useRef<AudioScheduledSourceNode[]>([]);
  const clock = useRef<{ ctxStart: number; outStart: number } | null>(null);
  const raf = useRef<number | null>(null);
  /** The last playhead value the player itself wrote (to spot user seeks). */
  const ownPlayhead = useRef<number | null>(null);

  const stopAudio = useCallback(() => {
    for (const s of sources.current) {
      try {
        s.stop();
      } catch {
        // already stopped
      }
    }
    sources.current = [];
  }, []);

  const pause = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    clock.current = null;
    stopAudio();
    videoRef.current?.pause();
    setPlaying(false);
  }, [stopAudio, videoRef]);

  /** Schedules all sound effects and music from output time `t0`. */
  const scheduleAudio = useCallback(
    async (ctx: AudioContext, t0: number, ctxStart: number) => {
      if (!project || !comp) return;
      const D = projectDuration(project);

      for (const s of project.sfx) {
        const end = s.start + s.duration;
        if (end <= t0) continue;
        const buffer = await loadBuffer(ctx, `sfx:${s.sound}`, () =>
          fetch(`/sfx/${s.sound}.ogg`).then((r) => r.arrayBuffer()),
        ).catch(() => null);
        if (!buffer || !clock.current) continue;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.value = s.volume * project.settings.sfxVolume;
        src.connect(gain).connect(ctx.destination);
        const offset = Math.max(0, t0 - s.start);
        src.start(ctxStart + Math.max(0, s.start - t0), offset);
        sources.current.push(src);
      }

      const m = project.music[0];
      if (m && m.end > t0) {
        const buffer =
          m.source.kind === "custom"
            ? customMusic
              ? await loadBuffer(ctx, `custom:${customMusic.name}:${customMusic.size}`, () => customMusic.arrayBuffer()).catch(() => null)
              : null
            : m.source.file
              ? await loadBuffer(ctx, `music:${m.source.file}`, () =>
                  fetch(`/music/${m.source.kind === "bundled" ? m.source.file : ""}`).then((r) => r.arrayBuffer()),
                ).catch(() => null)
              : null;
        if (buffer && clock.current) {
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          src.loop = true;
          const gain = ctx.createGain();
          // Envelope: fades plus ducking under speech, sampled every 50 ms.
          const speech = m.ducking ? speechRanges(comp.words) : [];
          const from = Math.max(t0, m.start);
          const until = Math.min(m.end, D);
          gain.gain.setValueAtTime(0, ctxStart);
          for (let t = from; t <= until; t += 0.05) {
            const talking = speech.some((r) => t >= r.start && t < r.end);
            const v = musicGainAt(m, t) * (talking ? DUCK_LEVEL : 1);
            gain.gain.linearRampToValueAtTime(v, ctxStart + (t - t0));
          }
          src.connect(gain).connect(ctx.destination);
          const offset = (from - m.start) % buffer.duration;
          src.start(ctxStart + (from - t0), offset);
          src.stop(ctxStart + (until - t0));
          sources.current.push(src);
        }
      }
    },
    [comp, customMusic, project],
  );

  const play = useCallback(async () => {
    const video = videoRef.current;
    if (!project || !comp || !video) return;
    const D = projectDuration(project);
    let t0 = useEditorStore.getState().playhead;
    if (t0 >= D - 0.05) t0 = 0;

    ctxRef.current ??= new AudioContext();
    const ctx = ctxRef.current;
    await ctx.resume();
    const ctxStart = ctx.currentTime + 0.08;
    clock.current = { ctxStart, outStart: t0 };
    setPlaying(true);
    void scheduleAudio(ctx, t0, ctxStart);

    video.currentTime = outputToSource(project.clips, t0) ?? 0;
    void video.play().catch(() => {});

    const tick = () => {
      const c = clock.current;
      if (!c) return;
      const t = Math.min(D, c.outStart + Math.max(0, ctx.currentTime - c.ctxStart));
      if (t >= D) {
        ownPlayhead.current = D;
        useEditorStore.getState().setPlayhead(D);
        pause();
        return;
      }
      const clip = clipAt(project.clips, t);
      if (clip) {
        const target = clip.sourceIn + (t - clip.start);
        // Re-seek at cuts and whenever the video drifts from the audio clock.
        if (Math.abs(video.currentTime - target) > MAX_DRIFT || video.currentTime >= clip.sourceOut) {
          video.currentTime = target;
        }
      }
      ownPlayhead.current = t;
      useEditorStore.getState().setPlayhead(t);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [comp, pause, project, scheduleAudio, videoRef]);

  const toggle = useCallback(() => (playing ? pause() : void play()), [pause, play, playing]);

  // Seeks from outside (timeline, scrubber): move the video, restart audio if playing.
  useEffect(() => {
    return useEditorStore.subscribe((state, prev) => {
      if (state.playhead === prev.playhead || state.playhead === ownPlayhead.current) return;
      const video = videoRef.current;
      if (!video || !state.project) return;
      if (clock.current) {
        pause();
        void play();
      } else {
        const s = outputToSource(state.project.clips, state.playhead);
        if (s !== null) video.currentTime = s;
      }
    });
  }, [pause, play, videoRef]);

  // Any edit while playing restarts playback with the new project.
  const projectRef = useRef(project);
  useEffect(() => {
    if (projectRef.current !== project && clock.current) {
      pause();
      void play();
    }
    projectRef.current = project;
  }, [pause, play, project]);

  // Show the right frame when a project loads.
  useEffect(() => {
    const video = videoRef.current;
    if (video && project) {
      const s = outputToSource(project.clips, useEditorStore.getState().playhead);
      if (s !== null && Math.abs(video.currentTime - s) > 0.01) video.currentTime = s;
    }
  }, [project, videoRef]);

  useEffect(
    () => () => {
      pause();
      void ctxRef.current?.close();
      ctxRef.current = null;
      bufferCache.clear();
    },
    [pause],
  );

  return { playing, play, pause, toggle };
}
