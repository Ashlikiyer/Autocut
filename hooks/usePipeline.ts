"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FFmpeg } from "@ffmpeg/ffmpeg";
import type {
  AutoDecisions,
  VideoAnalysis,
  EditSettings,
  EffectIntensity,
  EffectKind,
  EffectsPlan,
  PresetId,
  TimeRange,
  VideoInfo,
  Word,
} from "@/types";
import {
  engineMode,
  fallBackToSingleThread,
  loadFFmpeg,
  terminateFFmpeg,
} from "@/hooks/useFFmpeg";
import { fallbackPlan } from "@/lib/ai/fallback";
import { prepareAssets } from "@/lib/engine/assets";
import { extractAudio } from "@/lib/engine/audio";
import { extractSnapshotSheet, type Snapshot } from "@/lib/engine/frames";
import { PACING_THRESHOLD } from "@/lib/plan";
import { composeEdit, type Composition } from "@/lib/engine/compose";
import { FINAL_QUALITY, outputFps, outputSize, PREVIEW_QUALITY } from "@/lib/engine/filtergraph";
import {
  overlayKey,
  overlayServerUrl,
  overlaySupports,
  requestCardOverlay,
  type CardOverlay,
} from "@/lib/overlay-client";
import {
  FFmpegStalledError,
  mountInput,
  probeVideo,
  renderEdit,
  unmountInput,
} from "@/lib/engine/render";
import {
  ApiClientError,
  finishSession,
  requestAutoPlan,
  requestPlan,
  startSession,
  videoStats,
  transcribeChunk,
} from "@/lib/client";
import { LIMITS } from "@/lib/limits";

export type StageId =
  | "session"
  | "load"
  | "extract"
  | "transcribe"
  | "watch"
  | "plan"
  | "edit"
  | "motion"
  | "render";

export const STAGES: { id: StageId; label: string; weight: number }[] = [
  { id: "session", label: "Starting session", weight: 2 },
  { id: "load", label: "Loading video engine", weight: 6 },
  { id: "extract", label: "Extracting audio", weight: 10 },
  { id: "transcribe", label: "Transcribing speech", weight: 22 },
  { id: "watch", label: "AI watching your video", weight: 3 },
  { id: "plan", label: "AI director editing", weight: 8 },
  { id: "edit", label: "Building the edit", weight: 2 },
  { id: "motion", label: "HyperFrames animating graphics", weight: 6 },
  { id: "render", label: "Rendering preview", weight: 49 },
];

export type Phase = "idle" | "processing" | "preview" | "exporting" | "error";

export interface PipelineError {
  code: string;
  title: string;
  message: string;
  /** Offered when no speech was found: cut on detected silence only. */
  canContinueWithoutSpeech?: boolean;
}

export interface PipelineResult {
  comp: Composition;
  info: VideoInfo;
  settings: EditSettings;
  /** Whether the effects came from the AI director or the rule-based fallback. */
  planSource: "ai" | "fallback" | "none";
  /** What the AI saw and decided, in auto mode. */
  ai: { decisions: AutoDecisions; analysis: VideoAnalysis | null } | null;
  /** How the cards were animated: by HyperFrames, or drawn in the browser. */
  motion: "hyperframes" | "browser" | null;
  musicTitle: string | null;
  /** The bundled track the edit used, so the editor keeps the same song. */
  musicTrack: { file: string; title: string } | null;
  previewUrl: string;
  usageId: number;
  remainingToday: number;
}

interface State {
  phase: Phase;
  stage: StageId | null;
  stageProgress: number;
  /** When the current stage began (ms since epoch), for elapsed/ETA. */
  stageStartedAt: number | null;
  /** 0–100 across all stages. */
  progress: number;
  exportProgress: number;
  error: PipelineError | null;
  result: PipelineResult | null;
}

const INITIAL: State = {
  phase: "idle",
  stage: null,
  stageProgress: 0,
  stageStartedAt: null,
  progress: 0,
  exportProgress: 0,
  error: null,
  result: null,
};

class Cancelled extends Error {}

class PipelineFailure extends Error {
  constructor(public info: PipelineError) {
    super(info.message);
  }
}

function overallProgress(stage: StageId, stageProgress: number) {
  let done = 0;
  const total = STAGES.reduce((s, x) => s + x.weight, 0);
  for (const s of STAGES) {
    if (s.id === stage) {
      done += s.weight * Math.min(1, Math.max(0, stageProgress));
      break;
    }
    done += s.weight;
  }
  return Math.round((done / total) * 100);
}

function toPipelineError(err: unknown): PipelineError {
  if (err instanceof PipelineFailure) return err.info;
  if (err instanceof ApiClientError) {
    switch (err.code) {
      case "DAILY_LIMIT": {
        const at = err.details.resetsAt
          ? new Date(err.details.resetsAt).toLocaleString()
          : "in 24 hours";
        return {
          code: err.code,
          title: "Daily limit reached",
          message: `You've used all your free videos for today. Your next video unlocks ${at}.`,
        };
      }
      case "RATE_LIMITED":
        return {
          code: err.code,
          title: "AutoCut is busy",
          message: "Too many people are editing right now. Try again in a minute.",
        };
      case "FILE_TOO_LARGE":
        return {
          code: err.code,
          title: "Audio too large",
          message: "The audio couldn't be uploaded. Try a shorter video.",
        };
      case "NETWORK":
        return { code: err.code, title: "Connection problem", message: err.message };
      default:
        return {
          code: err.code,
          title: "Something went wrong",
          message: "A service AutoCut depends on didn't respond. Try again in a moment.",
        };
    }
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/memory|OOM|Aborted|RangeError/i.test(msg)) {
    return {
      code: "OUT_OF_MEMORY",
      title: "Your browser ran out of memory",
      message: "Try desktop Chrome, close other tabs, or use a shorter video.",
    };
  }
  return {
    code: "RENDER_FAILED",
    title: "Something went wrong",
    message: msg || "The edit couldn't be finished.",
  };
}

async function getFFmpeg(): Promise<FFmpeg> {
  try {
    return await loadFFmpeg();
  } catch {
    throw new PipelineFailure({
      code: "ENGINE_LOAD",
      title: "Your browser couldn't load the video engine",
      message: "AutoCut works best in desktop Chrome. Try again there.",
    });
  }
}

/** How long the multithreaded engine may stay silent before we assume it froze. */
const STALL_MS = 30_000;

/**
 * Runs an ffmpeg job. If the multithreaded engine freezes (a known
 * ffmpeg.wasm issue), restarts on the single-threaded engine, remounts the
 * input and runs the job once more.
 */
async function withEngineFallback<T>(
  file: File,
  inputPath: string,
  job: (ffmpeg: FFmpeg, inputPath: string, stallMs?: number) => Promise<T>,
  opts: { singleThread?: boolean } = {},
): Promise<{ value: T; inputPath: string }> {
  if (opts.singleThread && engineMode() === "multithread") {
    // Renders reliably freeze on the multithreaded core, so switch before
    // starting instead of waiting for the stall watchdog.
    const single = await fallBackToSingleThread();
    const path = await mountInput(single, file);
    return { value: await job(single, path), inputPath: path };
  }
  const ffmpeg = await getFFmpeg();
  const stallMs = engineMode() === "multithread" ? STALL_MS : undefined;
  try {
    return { value: await job(ffmpeg, inputPath, stallMs), inputPath };
  } catch (err) {
    if (!(err instanceof FFmpegStalledError)) throw err;
    console.warn("[pipeline] engine stalled, retrying single-threaded", err);
    const single = await fallBackToSingleThread();
    const path = await mountInput(single, file);
    return { value: await job(single, path), inputPath: path };
  }
}

/** Effects whose placement comes from the AI plan. */
const PLANNED_KINDS: EffectKind[] = ["zoom", "shake", "emoji", "text", "sfx", "hook"];

/**
 * A new plan is needed for a new style or amount, or when the user turns on
 * an effect the current plan wasn't asked for. Turning effects off reuses it.
 */
function needsReplan(
  current: { preset: PresetId; effects: EffectKind[]; intensity: EffectIntensity; auto: boolean } | null,
  s: EditSettings,
): boolean {
  if (!current) return true;
  if (s.auto) return !current.auto;
  if (current.preset !== s.preset || current.intensity !== s.intensity) return true;
  return s.effects.some((k) => PLANNED_KINDS.includes(k) && !current.effects.includes(k));
}

export function usePipeline() {
  const [state, setState] = useState<State>(INITIAL);

  // Working data kept outside React state (large or not needed for render).
  const run = useRef(0);
  const file = useRef<File | null>(null);
  const inputPath = useRef<string | null>(null);
  const info = useRef<VideoInfo | null>(null);
  const words = useRef<Word[]>([]);
  const silences = useRef<TimeRange[]>([]);
  const settings = useRef<EditSettings | null>(null);
  const plan = useRef<{
    preset: PresetId;
    effects: EffectKind[];
    intensity: EffectIntensity;
    plan: EffectsPlan;
    source: "ai" | "fallback";
    auto: boolean;
    ai: PipelineResult["ai"];
  } | null>(null);
  const snapshots = useRef<Snapshot[]>([]);
  const cardOverlay = useRef<{ key: string; overlay: CardOverlay } | null>(null);
  const customMusic = useRef<File | null>(null);
  const session = useRef<{ usageId: number; remainingToday: number } | null>(null);
  const previewUrl = useRef<string | null>(null);

  const patch = useCallback(
    (p: Partial<State>) => setState((s) => ({ ...s, ...p })),
    [],
  );

  const setStage = useCallback(
    (id: number, stage: StageId, stageProgress = 0) => {
      if (run.current !== id) throw new Cancelled();
      setState((s) => ({
        ...s,
        stage,
        stageProgress,
        stageStartedAt: s.stage === stage && s.stageStartedAt ? s.stageStartedAt : Date.now(),
        progress: overallProgress(stage, stageProgress),
      }));
    },
    [],
  );

  const revokePreview = useCallback(() => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
  }, []);

  /** Asks the AI director for an effects plan; falls back to rules on any failure. */
  const makePlan = useCallback(async (id: number, s: EditSettings) => {
    const v = info.current!;
    const usageId = session.current?.usageId ?? 0;

    if (s.auto) {
      // Let the AI see the video (a few low-res snapshots), then decide everything.
      if (s.shareFrames && !snapshots.current.length && file.current && inputPath.current) {
        setStage(id, "watch");
        try {
          const grabbed = await withEngineFallback(file.current, inputPath.current, (ff, path, stallMs) =>
            extractSnapshotSheet(ff, path, v.duration, stallMs),
          { singleThread: true });
          inputPath.current = grabbed.inputPath;
          snapshots.current = grabbed.value ? [grabbed.value] : [];
        } catch (err) {
          console.warn("[pipeline] snapshots failed, AI will use the transcript only", err);
        }
      }
      setStage(id, "plan");
      try {
        const stats = videoStats(words.current, v.duration, v.width, v.height);
        const res = await requestAutoPlan(
          usageId,
          v.duration,
          words.current,
          stats,
          s.shareFrames ? snapshots.current : [],
        );
        const d = res.decisions;
        // Apply the AI's choices; the user can still tweak them afterwards.
        settings.current = {
          ...s,
          preset: d.preset,
          captionStyle: d.captionStyle,
          effects: d.effects,
          intensity: d.intensity,
          removeFillers: d.removeFillers,
          silenceThreshold: PACING_THRESHOLD[d.pacing],
        };
        plan.current = {
          preset: d.preset,
          effects: d.effects,
          intensity: d.intensity,
          plan: res,
          source: "ai",
          auto: true,
          ai: { decisions: d, analysis: res.analysis },
        };
      } catch (err) {
        console.warn("[pipeline] AI auto-edit unavailable, using rule-based plan", err);
        const { preset, effects, intensity } = s;
        plan.current = {
          preset,
          effects,
          intensity,
          plan: fallbackPlan(words.current, preset, v.duration, { effects, intensity }),
          source: "fallback",
          auto: true,
          ai: null,
        };
      }
      if (run.current !== id) throw new Cancelled();
      return;
    }

    setStage(id, "plan");
    const { preset, effects, intensity } = s;
    try {
      const p = await requestPlan(usageId, preset, v.duration, words.current, effects, intensity);
      plan.current = { preset, effects, intensity, plan: p, source: "ai", auto: false, ai: null };
    } catch (err) {
      console.warn("[pipeline] AI plan unavailable, using rule-based plan", err);
      plan.current = {
        preset,
        effects,
        intensity,
        plan: fallbackPlan(words.current, preset, v.duration, { effects, intensity }),
        source: "fallback",
        auto: false,
        ai: null,
      };
    }
    if (run.current !== id) throw new Cancelled();
  }, [setStage]);

  /** Composes the edit from cached words + plan and renders the preview. */
  const cutAndPreview = useCallback(async (id: number) => {
    const s = settings.current!;
    const v = info.current!;

    setStage(id, "edit");
    const comp = composeEdit({
      words: words.current,
      silences: silences.current,
      info: v,
      settings: s,
      plan: plan.current?.plan ?? null,
    });
    const edl = comp.edl;
    if (edl.segments.length === 0 || edl.outputDuration < 0.5) {
      throw new PipelineFailure({
        code: "NOTHING_LEFT",
        title: "Nothing left to keep",
        message: "Every part of the video was detected as silence. Try a higher silence threshold.",
      });
    }

    // Optional: animate the cards with HyperFrames. Rendered once at the final
    // size and reused for the preview and the download.
    let overlay: CardOverlay | null = null;
    if (overlaySupports(comp) && overlayServerUrl()) {
      const [fw, fh] = outputSize(v, FINAL_QUALITY, comp.vertical);
      const key = overlayKey(comp, fw, fh);
      if (cardOverlay.current?.key === key) {
        overlay = cardOverlay.current.overlay;
      } else {
        setStage(id, "motion");
        try {
          overlay = await requestCardOverlay(comp, fw, fh, outputFps(v, FINAL_QUALITY));
          cardOverlay.current = { key, overlay };
          console.info(`[pipeline] HyperFrames rendered ${comp.cards.length} cards in ${overlay.renderSeconds} s`);
        } catch (err) {
          console.warn("[pipeline] HyperFrames unavailable, drawing cards in the browser", err);
        }
        if (run.current !== id) throw new Cancelled();
      }
    }

    setStage(id, "render");
    let musicTitle: string | null = null;
    let musicTrack: { file: string; title: string } | null = null;
    const rendered = await withEngineFallback(file.current!, inputPath.current!, async (ff, path, stallMs) => {
      const prepared = await prepareAssets(ff, comp, customMusic.current, overlay);
      musicTitle = prepared.musicTitle;
      musicTrack = prepared.musicTrack;
      return renderEdit(ff, path, v, comp, {
        quality: PREVIEW_QUALITY,
        x264Preset: "ultrafast",
        crf: 28,
        assets: prepared.assets,
        stallMs,
        onProgress: (r) => {
          if (run.current === id) {
            patch({ stageProgress: r, progress: overallProgress("render", r) });
          }
        },
      });
    }, { singleThread: true });
    if (run.current !== id) throw new Cancelled();
    inputPath.current = rendered.inputPath;
    const bytes = rendered.value;

    revokePreview();
    const url = URL.createObjectURL(
      new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "video/mp4" }),
    );
    previewUrl.current = url;
    const sess = session.current!;
    setState((st) => ({
      ...st,
      phase: "preview",
      stage: null,
      progress: 100,
      error: null,
      result: {
        comp,
        info: v,
        settings: s,
        planSource: plan.current && (s.auto || s.effects.length > 0 || s.music === "auto") ? plan.current.source : "none",
        ai: s.auto ? (plan.current?.ai ?? null) : null,
        motion: comp.cards.length ? (overlay ? "hyperframes" : "browser") : null,
        musicTitle,
        musicTrack,
        previewUrl: url,
        usageId: sess.usageId,
        remainingToday: sess.remainingToday,
      },
    }));
  }, [patch, revokePreview, setStage]);

  const fail = useCallback((id: number, err: unknown) => {
    if (err instanceof Cancelled || run.current !== id) return;
    console.error("[pipeline]", err);
    const e = toPipelineError(err);
    patch({ phase: "error", stage: null, error: e });
    if (session.current && !e.canContinueWithoutSpeech) {
      finishSession(session.current.usageId, "failed", e.code);
    }
  }, [patch]);

  /** Runs every stage for a newly uploaded video. */
  const process = useCallback(
    async (video: File, durationHint: number, s: EditSettings, music: File | null = null) => {
      const id = ++run.current;
      revokePreview();
      file.current = video;
      settings.current = s;
      customMusic.current = music;
      plan.current = null;
      snapshots.current = [];
      cardOverlay.current = null;
      words.current = [];
      silences.current = [];
      session.current = null;
      setState({ ...INITIAL, phase: "processing", stage: "session" });

      try {
        setStage(id, "session");
        session.current = await startSession(durationHint, s.preset);

        setStage(id, "load");
        const ffmpeg = await getFFmpeg();
        setStage(id, "load", 0.6);
        inputPath.current = await mountInput(ffmpeg, video);
        const v = await probeVideo(ffmpeg, inputPath.current);
        if (!v.duration) v.duration = durationHint;
        info.current = v;
        if (v.duration > LIMITS.maxVideoSeconds + 1) {
          throw new PipelineFailure({
            code: "TOO_LONG",
            title: "Video is too long",
            message: "AutoCut handles videos up to 15 minutes. Trim it first and try again.",
          });
        }
        if (!v.width) {
          throw new PipelineFailure({
            code: "NO_VIDEO",
            title: "No video found",
            message: "This file has no video track AutoCut can read.",
          });
        }
        if (!v.hasAudio) {
          throw new PipelineFailure({
            code: "NO_AUDIO",
            title: "No audio track",
            message: "This video has no sound, so there's nothing to cut on yet.",
          });
        }

        setStage(id, "extract");
        const extracted = await withEngineFallback(video, inputPath.current, (ff, path, stallMs) =>
          extractAudio(ff, path, v.duration, stallMs),
        );
        inputPath.current = extracted.inputPath;
        const audio = extracted.value;
        silences.current = audio.silences;

        setStage(id, "transcribe");
        const language = s.language === "auto" ? undefined : s.language;
        const all: Word[] = [];
        for (const chunk of audio.chunks) {
          const res = await transcribeChunk(session.current.usageId, chunk, language);
          all.push(...res.words);
          setStage(id, "transcribe", (chunk.index + 1) / audio.chunks.length);
        }
        words.current = all.sort((a, b) => a.start - b.start);

        if (words.current.length === 0) {
          throw new PipelineFailure({
            code: "NO_SPEECH",
            title: "No speech detected",
            message:
              "We couldn't hear anyone talking. You can still cut the silent parts based on volume.",
            canContinueWithoutSpeech: true,
          });
        }

        await makePlan(id, s);
        await cutAndPreview(id);
        finishSession(session.current.usageId, "rendered");
      } catch (err) {
        fail(id, err);
      }
    },
    [cutAndPreview, fail, makePlan, revokePreview, setStage],
  );

  /** After "no speech": cut on silencedetect results only. */
  const continueWithoutSpeech = useCallback(async () => {
    const id = ++run.current;
    patch({ phase: "processing", error: null });
    try {
      await cutAndPreview(id);
      if (session.current) finishSession(session.current.usageId, "rendered");
    } catch (err) {
      fail(id, err);
    }
  }, [cutAndPreview, fail, patch]);

  /**
   * Re-renders with new settings without transcribing again. A new preset
   * asks the AI director for a new plan.
   */
  const rerender = useCallback(
    async (changes: Partial<EditSettings>, music?: File | null, opts: { replan?: boolean } = {}) => {
      if (!settings.current) return;
      const id = ++run.current;
      settings.current = { ...settings.current, ...changes };
      if (music !== undefined) customMusic.current = music;
      patch({ phase: "processing", stage: "edit", error: null });
      try {
        if (words.current.length && (opts.replan || needsReplan(plan.current, settings.current))) {
          await makePlan(id, settings.current);
        }
        await cutAndPreview(id);
      } catch (err) {
        fail(id, err);
      }
    },
    [cutAndPreview, fail, makePlan, patch],
  );

  /** Renders the full-quality MP4 and downloads it. */
  const exportVideo = useCallback(async () => {
    const result = state.result;
    if (!result || !inputPath.current || !info.current) return;
    const id = ++run.current;
    patch({ phase: "exporting", exportProgress: 0 });
    try {
      const v = info.current;
      const rendered = await withEngineFallback(file.current!, inputPath.current, async (ff, path, stallMs) => {
        const cached = cardOverlay.current;
        const [fw, fh] = outputSize(v, FINAL_QUALITY, result.comp.vertical);
        const overlay = cached?.key === overlayKey(result.comp, fw, fh) ? cached.overlay : null;
        const prepared = await prepareAssets(ff, result.comp, customMusic.current, overlay);
        return renderEdit(ff, path, v, result.comp, {
          quality: FINAL_QUALITY,
          // ~3x faster than veryfast in wasm. Files are larger, but social
          // platforms re-encode uploads anyway.
          x264Preset: "ultrafast",
          crf: 20,
          assets: prepared.assets,
          stallMs,
          onProgress: (r) => run.current === id && patch({ exportProgress: r }),
        });
      }, { singleThread: true });
      if (run.current !== id) return;
      inputPath.current = rendered.inputPath;
      const bytes = rendered.value;

      const url = URL.createObjectURL(
        new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "video/mp4" }),
      );
      const base = (file.current?.name ?? "video").replace(/\.[^.]+$/, "");
      const a = document.createElement("a");
      a.href = url;
      a.download = `${base}-autocut.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Free the full-size render once the browser has started the download.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      patch({ phase: "preview", exportProgress: 1 });
    } catch (err) {
      if (err instanceof Cancelled || run.current !== id) return;
      console.error("[export]", err);
      patch({ phase: "preview", exportProgress: 0, error: toPipelineError(err) });
    }
  }, [state.result, patch]);

  /** Clears everything for a new upload. */
  const reset = useCallback(async () => {
    run.current++;
    revokePreview();
    file.current = null;
    info.current = null;
    words.current = [];
    silences.current = [];
    session.current = null;
    plan.current = null;
    snapshots.current = [];
    cardOverlay.current = null;
    customMusic.current = null;
    setState(INITIAL);
    try {
      const ffmpeg = await loadFFmpeg();
      await unmountInput(ffmpeg);
    } catch {
      // engine not loaded
    }
    inputPath.current = null;
  }, [revokePreview]);

  /** Stops the current job. ffmpeg can't be interrupted, so its worker is replaced. */
  const cancel = useCallback(async () => {
    run.current++;
    if (session.current) finishSession(session.current.usageId, "failed", "CANCELLED");
    await terminateFFmpeg();
    inputPath.current = null;
    revokePreview();
    setState(INITIAL);
    loadFFmpeg().catch(() => {});
  }, [revokePreview]);

  useEffect(() => () => revokePreview(), [revokePreview]);

  return { ...state, process, continueWithoutSpeech, rerender, exportVideo, reset, cancel };
}
