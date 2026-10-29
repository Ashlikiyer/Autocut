import "server-only";
import { z } from "zod";
import type { VideoAnalysis } from "@/types";
import { getGroq, withRateLimitRetry } from "./groq";

/** Vision-capable model on Groq. Override with GROQ_VISION_MODEL. */
const visionModel = () => process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b";

const analysisSchema = z.object({
  summary: z.string().catch("").transform((s) => s.slice(0, 400)),
  contentType: z.string().catch("other").transform((s) => s.slice(0, 40)),
  energy: z.enum(["low", "medium", "high"]).catch("medium"),
  mood: z.string().catch("").transform((s) => s.slice(0, 40)),
});

const SYSTEM = `You watch snapshots from a short video someone wants to post on TikTok or Reels, plus the start of what they say.
A snapshot may be a contact sheet: several frames in a grid, in time order left to right, top to bottom.
Return ONLY JSON:
{"summary": string (2 sentences: who/what is on screen, setting, what the video is about),
 "contentType": one of "talking-head", "tutorial", "vlog", "product", "podcast", "comedy", "story", "motivational", "gaming", "event", "other",
 "energy": "low" | "medium" | "high",
 "mood": short word like "fun", "serious", "calm", "hype", "emotional"}`;

/**
 * Looks at the snapshots and describes the video. Returns null if the
 * vision model is unavailable; the director then works from the transcript.
 * Snapshots are only forwarded to Groq, never stored.
 */
export async function analyzeSnapshots(
  snapshots: { at: number; times?: number[]; image: string }[],
  transcriptStart: string,
): Promise<VideoAnalysis | null> {
  // The vision model accepts at most 3 images per request.
  snapshots = snapshots.slice(0, 3);
  if (!snapshots.length) return null;
  const when = snapshots
    .map((s) =>
      s.times?.length
        ? `a contact sheet of frames at ${s.times.map((t) => `${t.toFixed(1)}s`).join(", ")}`
        : `a frame at ${s.at.toFixed(1)}s`,
    )
    .join("; ");
  try {
    const groq = getGroq();
    const res = await withRateLimitRetry(() =>
      groq.chat.completions.create({
        model: visionModel(),
        temperature: 0.2,
        max_completion_tokens: 500,
        response_format: { type: "json_object" },
        reasoning_effort: "none",
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Images: ${when}.\nThey say: "${transcriptStart.slice(0, 600)}"`,
              },
              ...snapshots.map((s) => ({ type: "image_url" as const, image_url: { url: s.image } })),
            ],
          },
        ],
      }),
    );
    const content = res.choices[0]?.message?.content;
    if (!content) return null;
    return analysisSchema.parse(JSON.parse(content));
  } catch (err) {
    console.warn("[vision] analysis failed, continuing with transcript only", err);
    return null;
  }
}
