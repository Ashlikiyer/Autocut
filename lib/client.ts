import type {
  ApiError,
  ApiErrorCode,
  AutoDecisions,
  VideoAnalysis,
  VideoStats,
  EffectIntensity,
  EffectKind,
  EffectsPlan,
  Word,
  PresetId,
  SessionResponse,
  TranscribeResponse,
} from "@/types";
import type { AudioChunk } from "@/lib/engine/audio";

/** Error from one of our API routes, with the code from the API reference. */
export class ApiClientError extends Error {
  constructor(
    public code: ApiErrorCode | "NETWORK",
    message: string,
    public details: Partial<ApiError> = {},
  ) {
    super(message);
  }
}

async function call<T>(input: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    throw new ApiClientError("NETWORK", "Couldn't reach the server. Check your connection.");
  }
  const body = (await res.json().catch(() => null)) as T | ApiError | null;
  if (!res.ok) {
    const err = (body ?? {}) as Partial<ApiError>;
    throw new ApiClientError(
      err.error ?? "UPSTREAM_ERROR",
      err.message ?? `Request failed (${res.status})`,
      err,
    );
  }
  return body as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function startSession(durationSec: number, preset: PresetId) {
  return call<SessionResponse>("/api/session", json("POST", { durationSec, preset }));
}

export function finishSession(
  usageId: number,
  status: "rendered" | "failed",
  errorCode?: string,
) {
  return call<{ ok: true }>(
    "/api/session",
    json("PATCH", { usageId, status, ...(errorCode ? { errorCode } : {}) }),
  ).catch(() => {
    // Status reporting is best effort.
  });
}

export function transcribeChunk(
  usageId: number,
  chunk: AudioChunk,
  language?: "en" | "tl",
) {
  const form = new FormData();
  form.set(
    "audio",
    new File([chunk.data as Uint8Array<ArrayBuffer>], chunk.name, { type: chunk.mime }),
  );
  form.set("usageId", String(usageId));
  form.set("chunkIndex", String(chunk.index));
  form.set("offsetSec", chunk.offsetSec.toFixed(3));
  if (language) form.set("language", language);
  return call<TranscribeResponse>("/api/transcribe", { method: "POST", body: form });
}

export function sendFeedback(usageId: number, rating: number, comment?: string) {
  return call<{ ok: true }>(
    "/api/feedback",
    json("POST", { usageId, rating, ...(comment ? { comment } : {}) }),
  );
}

export function requestPlan(
  usageId: number,
  preset: PresetId,
  duration: number,
  words: Word[],
  effects: EffectKind[],
  intensity: EffectIntensity,
) {
  return call<EffectsPlan>(
    "/api/plan",
    json("POST", {
      usageId,
      preset,
      duration,
      effects,
      intensity,
      transcript: { words: words.map(({ word, start, end }) => ({ word: word.slice(0, 100), start, end })) },
    }),
  );
}

export interface AutoPlanResponse extends EffectsPlan {
  decisions: AutoDecisions;
  analysis: VideoAnalysis | null;
}

/** Auto mode: the AI chooses the style and effects as well as placing them. */
export function requestAutoPlan(
  usageId: number,
  duration: number,
  words: Word[],
  stats: VideoStats,
  snapshots: { at: number; times?: number[]; image: string }[],
) {
  return call<AutoPlanResponse>(
    "/api/plan",
    json("POST", {
      usageId,
      // Ignored in auto mode, but the schema requires a preset.
      preset: "energetic",
      duration,
      auto: true,
      stats,
      snapshots,
      transcript: { words: words.map(({ word, start, end }) => ({ word: word.slice(0, 100), start, end })) },
    }),
  );
}

/** Simple numbers about the video for the AI director. */
export function videoStats(words: Word[], duration: number, width: number, height: number): VideoStats {
  const spoken = words.reduce((sum, w) => sum + Math.max(0, w.end - w.start), 0);
  const ratio = width && height ? width / height : 1;
  return {
    orientation: ratio > 1.1 ? "landscape" : ratio < 0.9 ? "portrait" : "square",
    speechRatio: duration > 0 ? Math.min(1, spoken / duration) : 0,
    wordsPerMinute: duration > 0 ? Math.min(1000, (words.length / duration) * 60) : 0,
  };
}
