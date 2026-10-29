import { z } from "zod";
import { LIMITS } from "@/lib/limits";
import { EFFECT_KINDS, PRESET_IDS } from "@/types";

export const presetSchema = z.enum(PRESET_IDS);

export const wordSchema = z.object({
  word: z.string(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
});

/** POST /api/session */
export const sessionRequestSchema = z.strictObject({
  durationSec: z.number().positive().max(LIMITS.maxVideoSeconds + 1),
  preset: presetSchema,
});

/** PATCH /api/session: the browser reports how the render ended. */
export const sessionUpdateSchema = z.strictObject({
  usageId: z.number().int().nonnegative(),
  status: z.enum(["rendered", "failed"]),
  errorCode: z
    .string()
    .regex(/^[A-Z_]{1,40}$/)
    .optional(),
});

/** POST /api/transcribe (multipart form fields other than the audio file) */
export const transcribeFieldsSchema = z.strictObject({
  usageId: z.coerce.number().int().nonnegative(),
  chunkIndex: z.coerce.number().int().min(0).max(100),
  offsetSec: z.coerce.number().min(0).max(LIMITS.maxVideoSeconds + 1),
  language: z.enum(["en", "tl"]).optional(),
});

/** POST /api/feedback */
export const feedbackSchema = z.strictObject({
  usageId: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

/** The parts of Groq's verbose_json transcription we use. */
export const groqTranscriptionSchema = z.object({
  language: z.string().optional(),
  words: z.array(wordSchema).optional().default([]),
});

/** POST /api/plan */
export const planRequestSchema = z.strictObject({
  usageId: z.number().int().nonnegative(),
  preset: presetSchema,
  duration: z.number().positive().max(LIMITS.maxVideoSeconds + 1),
  effects: z.array(z.enum(EFFECT_KINDS)).max(EFFECT_KINDS.length).optional(),
  intensity: z.enum(["less", "normal", "more"]).optional(),
  /** Auto mode: the AI also chooses style, effects, amount and pacing. */
  auto: z.boolean().optional(),
  stats: z
    .strictObject({
      orientation: z.enum(["portrait", "landscape", "square"]),
      speechRatio: z.number().min(0).max(1),
      wordsPerMinute: z.number().min(0).max(1000),
    })
    .optional(),
  /** Low-res JPEG snapshots, forwarded to the vision model and never stored. */
  snapshots: z
    .array(
      z.strictObject({
        at: z.number().nonnegative(),
        times: z.array(z.number().nonnegative()).max(12).optional(),
        image: z
          .string()
          .max(400_000)
          .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/),
      }),
    )
    // Groq's vision model accepts at most 3 images per request.
    .max(3)
    .optional(),
  transcript: z.strictObject({
    words: z.array(wordSchema.extend({ word: z.string().max(100) })).max(20000),
  }),
});
