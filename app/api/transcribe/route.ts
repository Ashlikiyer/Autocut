import { APIError } from "groq-sdk";
import { apiError } from "@/lib/api";
import { RateLimitedError, transcribeChunk } from "@/lib/ai/groq";
import { LIMITS } from "@/lib/limits";
import { transcribeFieldsSchema } from "@/lib/schemas";
import {
  getSupabaseAdmin,
  identifyVisitor,
  supabaseOptional,
} from "@/lib/supabase";
import { findUsageLog, setUsageStatus } from "@/lib/usage";
import type { TranscribeResponse } from "@/types";

const ALLOWED_FIELDS = new Set([
  "audio",
  "usageId",
  "chunkIndex",
  "offsetSec",
  "language",
]);

/** Sends one audio chunk to Groq Whisper and returns word timestamps. */
export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > LIMITS.maxAudioChunkBytes + 64 * 1024) {
    return apiError(413, "FILE_TOO_LARGE");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError(400, "BAD_REQUEST", { message: "Expected form data" });
  }

  for (const key of form.keys()) {
    if (!ALLOWED_FIELDS.has(key)) {
      return apiError(400, "BAD_REQUEST", { message: `Unknown field ${key}` });
    }
  }

  const audio = form.get("audio");
  if (!(audio instanceof File)) {
    return apiError(400, "BAD_REQUEST", { message: "Missing audio file" });
  }
  if (audio.size > LIMITS.maxAudioChunkBytes) {
    return apiError(413, "FILE_TOO_LARGE");
  }
  const mime = audio.type.split(";")[0].trim().toLowerCase();
  if (!(LIMITS.acceptedAudioTypes as readonly string[]).includes(mime)) {
    return apiError(400, "BAD_REQUEST", { message: "Unsupported audio type" });
  }

  const fields = transcribeFieldsSchema.safeParse({
    usageId: form.get("usageId"),
    chunkIndex: form.get("chunkIndex"),
    offsetSec: form.get("offsetSec"),
    language: form.get("language") ?? undefined,
  });
  if (!fields.success) return apiError(400, "BAD_REQUEST");
  const { usageId, chunkIndex, offsetSec, language } = fields.data;

  // Only callers holding a session from /api/session may transcribe.
  const db = getSupabaseAdmin();
  if (db) {
    try {
      const log = await findUsageLog(db, usageId, identifyVisitor(request));
      if (!log || log.status === "failed" || log.status === "rendered") {
        return apiError(400, "BAD_REQUEST", { message: "Invalid session" });
      }
    } catch (err) {
      console.error("[transcribe] session lookup failed", err);
      return apiError(502, "UPSTREAM_ERROR");
    }
  } else if (!supabaseOptional()) {
    return apiError(502, "UPSTREAM_ERROR");
  }

  try {
    const result = await transcribeChunk(audio, offsetSec, language);
    if (db) {
      await setUsageStatus(db, usageId, "transcribed").catch((err) =>
        console.error("[transcribe] status update failed", err),
      );
    }
    return Response.json({
      chunkIndex,
      language: result.language,
      words: result.words,
    } satisfies TranscribeResponse);
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return apiError(
        429,
        "RATE_LIMITED",
        { retryAfter: err.retryAfter },
        { "Retry-After": String(err.retryAfter) },
      );
    }
    if (err instanceof APIError && err.status === 413) {
      return apiError(413, "FILE_TOO_LARGE");
    }
    console.error("[transcribe] Groq request failed", err);
    return apiError(502, "UPSTREAM_ERROR");
  }
}
