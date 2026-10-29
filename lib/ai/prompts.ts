import type { PresetId, Word } from "@/types";
import { ALLOWED_EMOJI, PRESETS } from "@/lib/presets";
import type { PlanOptions } from "@/lib/plan";
import { sentences } from "./fallback";

const PRESET_NOTES: Record<PresetId, string> = {
  energetic: "High energy. Mark the claims, numbers, reveals and list items that hit hardest.",
  clean: "Calm and minimal. Only the few lines that truly matter; it's fine to mark almost nothing.",
  funny: "Comedic. Mark punchlines and reactions precisely, on the exact funny word.",
  podcast: "Conversation. Mark at most one or two emotional or key moments per minute.",
  creator:
    "Polished creator/tutorial look. Prefer pills (context labels that sum up a claim), step cards for each step, and one focus title for the big idea. No emoji.",
};

/** How many moments per minute a style should have (a ceiling, not a target). */
const MOMENT_BUDGET: Record<PresetId, string> = {
  energetic: "3-6",
  clean: "1-3",
  funny: "3-6",
  podcast: "0-2",
  creator: "3-6",
};

/** Shared guide: the AI finds moments; AutoCut chooses the effects for each. */
const MOMENTS_GUIDE = `How you edit: you do NOT place effects. You find MOMENTS that deserve emphasis, like a real editor would, and AutoCut applies the right effect for each moment type:
- "punchline": the exact funny line or joke payoff -> fast punch zoom + shake + boom
- "reveal": a twist, surprise or answer the viewer was waiting for -> punch zoom + whoosh + text pop
- "number": a striking number, price or stat -> text pop showing it + ding (no zoom)
- "list_item": "first", "step 2", "number three" -> text pop like "STEP 2" + pop sound
- "question": a question that hooks the viewer -> shaking text pop + swoosh
- "emotional": a heartfelt, serious or vulnerable line -> slow, gentle push-in, no sound
- "reaction": a big reaction (shock, laughing, cringe) -> emoji + pop
- "call_to_action": "follow", "comment", "link in bio" -> text pop + 👇 + ding
- "key_point": the single most important sentence of a section -> one gentle punch zoom
- "pill": a claim worth labelling, like a sticky note at the top of the screen -> small pill, e.g. "₱0 · WALANG PAID COURSE", "24/7 EDITOR · READY" (max 6 words; use " · " to join two parts)
- "step": a step in a process -> a "STEP 1: DOWNLOAD CLAUDE" card; give "label" ("STEP 1") and "text" (max 4 words, the action)
- "focus": the big named idea or method of the video -> blurred background + huge title, e.g. "SHARINGAN METHOD" (max 3 words)

Rules for moments:
- Be selective. Most sentences get NO moment. Greetings, filler, transitions and setup lines never get one.
- Never mark two moments within 4 seconds of each other. Never mark the same idea twice.
- "start" is the time of the exact word where the moment lands (the punch word, the number, the reveal word); "end" is when that phrase ends. Use the transcript timestamps.
- "text" (for reveal, number, list_item, question, call_to_action): max 4 words, in the speaker's language, written the way a viewer would want to read it (e.g. "₱10,000 IN 1 WEEK", "STEP 2", "BAKIT?").
- "emoji" (for punchline, reaction, call_to_action): only if it truly fits, from: ${ALLOWED_EMOJI.join(" ")}
- "emphasis": 1-3 key words from that line to highlight in the captions.
- Pills, steps and focus titles need "text"; they stay on screen about 3 seconds, so never put two within 4 seconds.`;

const MOMENT_SCHEMA = `"moments": [{"type": one of the moment types, "start": number, "end": number, "text"?: string, "label"?: string, "emoji"?: string, "emphasis"?: [string]}]`;

const HOOK_FIELDS = `"hook": string, "hookAccent": string (the 1-2 words of the hook to colour), "hookSticker": string (optional sticker under the hook, max 4 words, e.g. "NO COURSE NEEDED")`;

export function systemPrompt(preset: PresetId, duration: number, opts: PlanOptions = {}): string {
  const p = PRESETS[preset];
  const on = new Set(opts.effects ?? p.defaultEffects);
  const notWanted = [
    !on.has("zoom") && !on.has("shake") ? "the user turned zooms off, so avoid key_point and emotional moments" : "",
    !on.has("text") ? "the user turned text pops off, so leave out \"text\"" : "",
  ].filter(Boolean);
  return `You are a top short-form video editor for TikTok and Reels.
Given a timestamped transcript and a style, return ONLY JSON matching the schema. No prose, no markdown.

Style: ${p.label}. ${PRESET_NOTES[preset]}
Video length: ${duration.toFixed(1)} seconds. At most ${MOMENT_BUDGET[preset]} moments per minute; fewer is better than forced.
${notWanted.length ? `Note: ${notWanted.join("; ")}.` : ""}

${MOMENTS_GUIDE}

Also:
- Pick one music mood: upbeat, chill, dramatic, playful, none.
- Write a hook title of max 6 words for the first 3 seconds, in the speaker's language, that makes people keep watching.
- Every time must be within 0 and ${duration.toFixed(1)}.

Schema:
{${HOOK_FIELDS}, "music": {"mood": "upbeat"|"chill"|"dramatic"|"playful"|"none", "volume": number},
 ${MOMENT_SCHEMA}}`;
}

/** Transcript as numbered lines with times, e.g. "3. [12.30-15.10] text". */
export function transcriptLines(words: Word[]): string {
  return sentences(words)
    .map(
      (s, i) =>
        `${i + 1}. [${s[0].start.toFixed(2)}-${s[s.length - 1].end.toFixed(2)}] ${s
          .map((w) => w.word.trim())
          .join(" ")}`,
    )
    .join("\n");
}

const STYLE_GUIDE = `Styles you can choose:
- "energetic": hype, motivational, money/business tips, listicles, fast talkers. Bold captions, lots of zooms, SFX.
- "clean": tutorials, explainers, calm or professional talks, product demos. Subtle captions, few effects.
- "funny": comedy, skits, reactions, storytimes with jokes, playful vlogs. Comic captions, emoji, shakes, meme SFX.
- "podcast": long conversations, interviews, serious discussions. Readable captions, almost no effects.
- "creator": tutorials, "how I did it", tips with steps, tech/business explainers by a creator talking to camera. One-word captions, context pills, step cards, focus titles, jump-cut zoom. Clean and premium, no emoji.

Effects you can switch on (pick what genuinely fits; fewer is fine for calm content):
- "zoom": punch-in zooms on punchlines, reveals and key points; slow push-ins on emotional lines
- "shake": camera shake on big or funny moments
- "emoji": emoji that match words
- "text": big text pops on the strongest phrases
- "transitions": white flash + whoosh at the biggest cuts
- "sfx": sound effects (whoosh, pop, ding, boom, scratch...)
- "hook": a catchy title in the first 3 seconds
- "progress": a thin progress bar
- "colorBoost": punchier colors
- "vignette": darker edges, cinematic
- "cutZoom": alternate close/wide framing at each jump cut (hides cuts, feels edited)
- "pills": context pills at the top of the screen
- "cards": step cards and focus titles

Intensity: "less", "normal" or "more" (how big and frequent the effects feel).
Pacing (how hard pauses are cut): "tight" (fast, punchy), "balanced", "relaxed" (keeps breathing room, good for emotional or calm content).
removeFillers: true to cut "um", "uh", "ano", "parang"; false only if fillers are part of the comedy or character.`;

/** Auto mode: the director picks the style and effects, then places them. */
export function autoSystemPrompt(
  duration: number,
  stats: { orientation: string; speechRatio: number; wordsPerMinute: number } | undefined,
  analysis: { summary: string; contentType: string; energy: string; mood: string } | null,
): string {
  const seen = analysis
    ? `What the video looks like (from snapshots): ${analysis.summary} Content type: ${analysis.contentType}. Energy: ${analysis.energy}. Mood: ${analysis.mood}.`
    : "No snapshots were shared; judge from the transcript.";
  const numbers = stats
    ? `Video: ${duration.toFixed(1)} s, ${stats.orientation}, speech ${Math.round(stats.speechRatio * 100)}% of the time, ${Math.round(stats.wordsPerMinute)} words per minute.`
    : `Video: ${duration.toFixed(1)} s.`;
  return `You are an expert short-form video editor for TikTok and Reels. You edit the whole video yourself.
First understand the video, then decide the edit, then find the moments that deserve emphasis. Return ONLY JSON, no prose, no markdown.

${numbers}
${seen}

${STYLE_GUIDE}

${MOMENTS_GUIDE}

Moment budget per minute (a ceiling, not a target): energetic 3-6, clean 1-3, funny 3-6, podcast 0-2, creator 3-6. Choose your effects to match the moments you found (e.g. no "shake" if there are no punchlines).

Also:
- Music mood: upbeat, chill, dramatic, playful or none, matching the mood.
- Hook: max 6 words, in the speaker's language, makes people keep watching.
- Every time must be within 0 and ${duration.toFixed(1)} and match the transcript timestamps.

Schema:
{"decisions": {"style": "energetic"|"clean"|"funny"|"podcast"|"creator", "captionStyle": same options, "effects": [effect names], "intensity": "less"|"normal"|"more", "pacing": "tight"|"balanced"|"relaxed", "removeFillers": boolean, "reason": string (one short sentence to the user, in English, why this edit fits)},
 ${HOOK_FIELDS}, "music": {"mood": string, "volume": number},
 ${MOMENT_SCHEMA}}`;
}
