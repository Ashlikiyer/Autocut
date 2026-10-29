import "server-only";
import Groq, { APIError } from "groq-sdk";
import type { Word } from "@/types";
import { groqTranscriptionSchema } from "@/lib/schemas";

export const WHISPER_MODEL = "whisper-large-v3-turbo";

/**
 * Whisper tends to drop fillers; a prompt full of them nudges it toward
 * verbatim output so they can be detected and cut.
 */
export const FILLER_PROMPT =
  "Umm, so, uh, ano, parang, like, you know, kasi, ah, eh, hmm...";

/** Longest Groq retry-after we'll wait for inside one request. */
const MAX_RETRY_WAIT_SEC = 8;

let client: Groq | null = null;

export function getGroq(): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");
  // We handle the single 429 retry ourselves (see withRateLimitRetry).
  client ??= new Groq({ apiKey, maxRetries: 0, timeout: 60_000 });
  return client;
}

export class RateLimitedError extends Error {
  constructor(public retryAfter: number) {
    super("Groq rate limit reached");
  }
}

function retryAfterSeconds(err: APIError): number {
  const raw = err.headers?.get("retry-after");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : 10;
}

/** Retries once on 429 using retry-after, then throws RateLimitedError. */
export async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof APIError) || err.status !== 429) throw err;
    const wait = retryAfterSeconds(err);
    if (wait > MAX_RETRY_WAIT_SEC) throw new RateLimitedError(wait);
    await new Promise((r) => setTimeout(r, wait * 1000));
    try {
      return await fn();
    } catch (err2) {
      if (err2 instanceof APIError && err2.status === 429) {
        throw new RateLimitedError(retryAfterSeconds(err2));
      }
      throw err2;
    }
  }
}

/**
 * Transcribes one audio chunk with word timestamps. Returned times are
 * shifted by `offsetSec` so they sit on the original video timeline.
 */
export async function transcribeChunk(
  file: File,
  offsetSec: number,
  language?: string,
): Promise<{ language?: string; words: Word[] }> {
  const groq = getGroq();
  const raw = await withRateLimitRetry(() =>
    groq.audio.transcriptions.create({
      file,
      model: WHISPER_MODEL,
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
      prompt: FILLER_PROMPT,
      temperature: 0,
      ...(language ? { language } : {}),
    }),
  );

  const parsed = groqTranscriptionSchema.parse(raw);
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return {
    language: parsed.language,
    words: parsed.words
      .map((w) => ({
        word: w.word.trim(),
        start: round(w.start + offsetSec),
        end: round(Math.max(w.end, w.start) + offsetSec),
      }))
      .filter((w) => w.word.length > 0),
  };
}
