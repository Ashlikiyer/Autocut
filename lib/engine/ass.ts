import type { TextStyle, Word } from "@/types";
import { FONTS_WITH_PESO, type CaptionStyle } from "@/lib/presets";

export interface AssText {
  start: number;
  end: number;
  text: string;
  style: TextStyle;
}

export interface AssInput {
  width: number;
  height: number;
  /** Words on the output timeline. Empty when captions are off. */
  words: Word[];
  caption: CaptionStyle;
  hook?: { text: string; font: string; color: string; duration: number };
  texts: AssText[];
  /**
   * Caption chunks as the editor grouped them. When set, these are used
   * instead of grouping `words` automatically.
   */
  groups?: Word[][];
  /** Captions are left out during these ranges (e.g. focus titles). */
  hideCaptions?: { start: number; end: number }[];
}

/** #RRGGBB → ASS &HAABBGGRR (alpha 00 = opaque). */
export function assColor(hex: string, alpha = 0): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`Bad color ${hex}`);
  const a = alpha.toString(16).padStart(2, "0");
  return `&H${a}${m[3]}${m[2]}${m[1]}`.toUpperCase();
}

/** Seconds → H:MM:SS.cc */
export function assTime(sec: number): string {
  const cs = Math.max(0, Math.round(sec * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${h}:${p(m)}:${p(s)}.${p(c)}`;
}

/**
 * Makes user/LLM text safe for an ASS event. Braces start override blocks and
 * backslashes start tags, so neither may reach the file.
 */
export function escapeAss(text: string): string {
  return text
    .replace(/[{}]/g, "")
    .replace(/\\/g, "/")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Draws characters the font lacks (the peso sign, in Poppins) with a bundled
 * fallback font. Call after escapeAss, since this adds override tags.
 */
export function withGlyphFallback(text: string, font: string): string {
  if (FONTS_WITH_PESO.has(font)) return text;
  return text.replace(/₱/g, "{\\fnAnton}₱{\\fn}");
}

/**
 * libass sizes a font by its OS/2 win ascent + descent, not its em: for the
 * bundled fonts (Poppins, Bangers, Anton) that's about 1.76 em. Font sizes
 * are multiplied by this so captions come out at the em size the editor
 * preview draws with CSS (measured: Fontsize 176 → 100 px em).
 */
export const ASS_FONT_SCALE = 1.76;

/** A pause longer than this starts a new caption chunk. */
export const CAPTION_PAUSE = 0.45;
/** How long a caption stays up after its last word is spoken. */
export const CAPTION_HOLD = 0.15;
/** A word counts as "still being said" for at most this long (Whisper sometimes stretches a word over a pause). */
const MAX_WORD_SECONDS = 1.2;

/**
 * When a caption chunk leaves the screen: just after its last word ends, or
 * when the next chunk starts. Captions only show while someone is talking.
 * Shared with the editor preview.
 */
export function captionEnd(chunk: Word[], nextStart = Infinity): number {
  const last = chunk[chunk.length - 1];
  const spoken = Math.min(last.end, last.start + MAX_WORD_SECONDS);
  return Math.max(last.start + 0.05, Math.min(spoken + CAPTION_HOLD, nextStart));
}

/**
 * How a word looks as it's revealed, `local` seconds after it's spoken:
 * it fades in and pops (85% -> peak -> rest). Shared with the editor preview
 * so both draw the same animation.
 */
export const WORD_POP = { fadeMs: 70, upMs: 90, downMs: 90, from: 0.85, peak: 1.12, emphasisPeak: 1.25 };

export function wordPopAt(local: number, emphasis = false): { scale: number; opacity: number } {
  const rest = emphasis ? 1.1 : 1;
  const peak = emphasis ? WORD_POP.emphasisPeak : WORD_POP.peak;
  const up = WORD_POP.upMs / 1000;
  const down = WORD_POP.downMs / 1000;
  const opacity = Math.max(0, Math.min(1, local / (WORD_POP.fadeMs / 1000)));
  if (local <= 0) return { scale: WORD_POP.from, opacity: 0 };
  if (local < up) return { scale: WORD_POP.from + (peak - WORD_POP.from) * (local / up), opacity };
  if (local < up + down) return { scale: peak - (peak - rest) * ((local - up) / down), opacity };
  return { scale: rest, opacity };
}

/** Splits words into on-screen caption chunks. */
export function groupWords(words: Word[], maxWords: number): Word[][] {
  const chunks: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    const prev = cur[cur.length - 1];
    const breakHere =
      cur.length > 0 &&
      (cur.length >= maxWords ||
        w.start - prev.end > CAPTION_PAUSE ||
        /[.?!]$/.test(prev.word) ||
        w.end - cur[0].start > 3);
    if (breakHere) {
      chunks.push(cur);
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

const TEXT_ANIM: Record<TextStyle, string> = {
  bounce:
    "\\fad(0,150)\\fscx40\\fscy40\\t(0,140,\\fscx118\\fscy118)\\t(140,240,\\fscx100\\fscy100)",
  pop: "\\fad(80,150)\\fscx80\\fscy80\\t(0,120,\\fscx100\\fscy100)",
  shake:
    "\\fad(60,150)\\t(0,70,\\frz7)\\t(70,140,\\frz-7)\\t(140,210,\\frz5)\\t(210,280,\\frz0)",
};

export function buildAss(input: AssInput): string {
  const { width: W, height: H, caption: c } = input;
  const short = Math.min(W, H);
  // `size` is the em size (as in CSS); libass needs it as a line height.
  const em = short * c.size;
  const fs = Math.round(em * ASS_FONT_SCALE);
  const outline = Math.max(1, Math.round(em * c.outlineWidth));
  const marginV = Math.round(H * c.marginBottom);
  const side = Math.round(W * 0.06);
  const popSize = Math.round(short * 0.1);
  const hookSize = Math.round(short * 0.075);

  const style = (
    name: string,
    font: string,
    size: number,
    primary: string,
    outlineColor: string,
    back: string,
    borderStyle: number,
    outlineW: number,
    shadow: number,
    alignment: number,
    mv: number,
  ) =>
    `Style: ${name},${font},${size},${primary},${primary},${outlineColor},${back},0,0,0,0,100,100,0,0,${borderStyle},${outlineW},${shadow},${alignment},${side},${side},${mv},1`;

  const lines = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    style("Caption", c.font, fs, assColor(c.color), assColor(c.outline), assColor("#000000", 0x80), 1, outline, c.shadow, 2, marginV),
    style("Pop", c.font, popSize, assColor(c.highlight), assColor("#000000"), assColor("#000000", 0x80), 1, Math.round(popSize * 0.1), 3, 8, Math.round(H * 0.3)),
    input.hook
      ? style("Hook", input.hook.font, hookSize, assColor("#111111"), assColor(input.hook.color), assColor(input.hook.color), 3, Math.round(hookSize * 0.35), 0, 8, Math.round(H * 0.1))
      : "",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "");

  const event = (layer: number, start: number, end: number, styleName: string, text: string) =>
    `Dialogue: ${layer},${assTime(start)},${assTime(end)},${styleName},,0,0,0,,${text}`;

  // Captions
  const fmt = (w: string) => {
    const t = escapeAss(w);
    return withGlyphFallback(c.uppercase ? t.toUpperCase() : t, c.font);
  };
  const hidden = input.hideCaptions ?? [];
  const visible = (w: Word) => !hidden.some((h) => w.start < h.end && h.start < w.end);
  const chunks = input.groups
    ? input.groups.map((g) => g.filter(visible)).filter((g) => g.length > 0)
    : groupWords(input.words.filter(visible), c.maxWords);
  const hi = assColor(c.highlight);
  const pct = (v: number) => Math.round(v * 100);
  // Words already said; key words stay highlighted (and a touch bigger).
  const said = (w: Word) =>
    w.emphasis ? `{\\1c${hi}&\\fscx110\\fscy110}${fmt(w.word)}{\\r}` : fmt(w.word);
  // The word being said fades and pops in; with word highlight it's colored too.
  const saying = (w: Word) => {
    const peak = pct(w.emphasis ? WORD_POP.emphasisPeak : WORD_POP.peak);
    const rest = w.emphasis ? 110 : 100;
    const color = c.wordHighlight || w.emphasis ? `\\1c${hi}&` : "";
    const up = WORD_POP.upMs;
    return (
      `{${color}\\alpha&HFF&\\fscx${pct(WORD_POP.from)}\\fscy${pct(WORD_POP.from)}` +
      `\\t(0,${WORD_POP.fadeMs},\\alpha&H00&)\\t(0,${up},\\fscx${peak}\\fscy${peak})` +
      `\\t(${up},${up + WORD_POP.downMs},\\fscx${rest}\\fscy${rest})}${fmt(w.word)}{\\r}`
    );
  };
  // Words not said yet are drawn invisible, so the line keeps its layout
  // and doesn't shift as words appear.
  const upcoming = (w: Word) => `{\\alpha&HFF&}${fmt(w.word)}{\\r}`;
  chunks.forEach((chunk, ci) => {
    const chunkEnd = captionEnd(chunk, chunks[ci + 1]?.[0].start);
    // One event per word: words appear exactly when they're spoken.
    chunk.forEach((w, wi) => {
      const start = w.start;
      const end = wi === chunk.length - 1 ? chunkEnd : Math.min(chunk[wi + 1].start, chunkEnd);
      if (end <= start) return;
      const text = chunk
        .map((x, xi) => (xi < wi ? said(x) : xi === wi ? saying(x) : upcoming(x)))
        .join(" ");
      lines.push(event(0, start, end, "Caption", text));
    });
  });

  // Hook title over the first seconds
  if (input.hook) {
    const text = withGlyphFallback(escapeAss(input.hook.text).toUpperCase(), input.hook.font);
    if (text) {
      lines.push(
        event(2, 0, input.hook.duration, "Hook",
          `{\\fad(120,250)\\fscx70\\fscy70\\t(0,160,\\fscx106\\fscy106)\\t(160,280,\\fscx100\\fscy100)}${text}`),
      );
    }
  }

  // Text pops
  for (const t of input.texts) {
    const text = withGlyphFallback(escapeAss(t.text).toUpperCase(), c.font);
    if (text) lines.push(event(1, t.start, t.end, "Pop", `{${TEXT_ANIM[t.style]}}${text}`));
  }

  return lines.join("\n") + "\n";
}
