import type { CompCard } from "./compose";

/**
 * Browser-only: draws cards (pills, step cards, focus titles, the hook) as
 * transparent PNGs, 1080 px wide; the renderer scales them to the output.
 * Kept free of React and of ffmpeg so it can also run in a headless browser
 * for visual checks.
 */

export interface CardTheme {
  panel: string;
  accent: string;
  text: string;
}

const FAMILY = `"AC Poppins", "AC Anton", sans-serif`;
const WIDTH = 1080;

let fontsReady: Promise<void> | null = null;

/** Loads the bundled caption fonts into the page once. */
export function loadCardFonts(base = ""): Promise<void> {
  fontsReady ??= (async () => {
    const faces = [
      new FontFace("AC Poppins", `url(${base}/fonts/Poppins-SemiBold.ttf)`, { weight: "600" }),
      new FontFace("AC Poppins", `url(${base}/fonts/Poppins-Bold.ttf)`, { weight: "700" }),
      new FontFace("AC Bangers", `url(${base}/fonts/Bangers-Regular.ttf)`, { weight: "400" }),
      new FontFace("AC Poppins", `url(${base}/fonts/Poppins-ExtraBold.ttf)`, { weight: "800" }),
      new FontFace("AC Poppins", `url(${base}/fonts/Poppins-Black.ttf)`, { weight: "900" }),
      // Fallback for ₱, which Poppins lacks.
      new FontFace("AC Anton", `url(${base}/fonts/Anton-Regular.ttf)`, { weight: "400" }),
    ];
    for (const f of faces) document.fonts.add(await f.load());
  })().catch((err) => {
    fontsReady = null;
    throw err;
  });
  return fontsReady;
}

type Ctx = OffscreenCanvasRenderingContext2D;

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function font(ctx: Ctx, weight: number, size: number) {
  ctx.font = `${weight} ${size}px ${FAMILY}`;
}

/** Largest size (stepping down) at which `text` fits in `maxWidth`. */
function fit(ctx: Ctx, text: string, weight: number, start: number, maxWidth: number, min = 24) {
  let size = start;
  for (; size > min; size -= 2) {
    font(ctx, weight, size);
    if (ctx.measureText(text).width <= maxWidth) break;
  }
  font(ctx, weight, size);
  return size;
}

function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

async function toPng(canvas: OffscreenCanvas): Promise<Uint8Array> {
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Uint8Array(await blob.arrayBuffer());
}

/** Small rounded label with a check icon, e.g. "₱0 · WALANG PAID COURSE". */
function drawPill(text: string, t: CardTheme) {
  const h = 70;
  const canvas = new OffscreenCanvas(WIDTH, h + 16);
  const ctx = canvas.getContext("2d")!;
  const label = text.toUpperCase();
  const size = fit(ctx, label, 800, 30, WIDTH - 220);
  const textW = ctx.measureText(label).width;
  const icon = 38;
  const w = 22 + icon + 14 + textW + 30;
  const x = (WIDTH - w) / 2;

  ctx.shadowColor = "rgba(0,0,0,.35)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  roundRect(ctx, x, 4, w, h, h / 2);
  ctx.fillStyle = withAlpha(t.panel, 0.92);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(255,255,255,.12)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Check icon
  const cx = x + 22 + icon / 2;
  const cy = 4 + h / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, icon / 2, 0, Math.PI * 2);
  ctx.fillStyle = t.accent;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy);
  ctx.lineTo(cx - 2, cy + 6);
  ctx.lineTo(cx + 9, cy - 7);
  ctx.strokeStyle = t.panel;
  ctx.lineWidth = 4.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  ctx.fillStyle = t.text;
  ctx.textBaseline = "middle";
  font(ctx, 800, size);
  ctx.fillText(label, x + 22 + icon + 14, cy + 2);
  return canvas;
}

/** "STEP 1: DOWNLOAD CLAUDE" headline over a mock app window. */
function drawStep(label: string, text: string, t: CardTheme) {
  const canvas = new OffscreenCanvas(WIDTH, 560);
  const ctx = canvas.getContext("2d")!;
  const left = `${label.toUpperCase()}: `;
  const right = text.toUpperCase();
  const maxW = 960;

  // Headline: the label in white, the action in the accent colour, fitted to one line.
  let size = 84;
  for (; size > 34; size -= 2) {
    font(ctx, 900, size * 0.62);
    const lw = ctx.measureText(left).width;
    font(ctx, 900, size);
    if (lw + ctx.measureText(right).width <= maxW) break;
  }
  font(ctx, 900, size * 0.62);
  const lw = ctx.measureText(left).width;
  font(ctx, 900, size);
  const rw = ctx.measureText(right).width;
  const x0 = (WIDTH - lw - rw) / 2;
  const base = 40 + size;

  // Three little "spark" strokes above the action word.
  const sx = x0 + lw + rw / 2;
  ctx.strokeStyle = t.accent;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  for (const [dx, ang] of [[-34, -0.5], [0, 0], [34, 0.5]] as const) {
    ctx.beginPath();
    ctx.moveTo(sx + dx + Math.sin(ang) * 6, 30 - Math.cos(ang) * 6);
    ctx.lineTo(sx + dx + Math.sin(ang) * 24, 30 - Math.cos(ang) * 24);
    ctx.stroke();
  }

  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(0,0,0,.55)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 5;
  font(ctx, 900, size * 0.62);
  ctx.fillStyle = t.text;
  ctx.fillText(left, x0, base);
  font(ctx, 900, size);
  ctx.fillStyle = t.accent;
  ctx.fillText(right, x0 + lw, base);
  ctx.shadowColor = "transparent";

  // Mock app window: traffic lights, a highlighted row and skeleton lines.
  const wx = 110;
  const wy = base + 36;
  const ww = WIDTH - 2 * wx;
  const wh = 320;
  ctx.shadowColor = "rgba(0,0,0,.45)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  roundRect(ctx, wx, wy, ww, wh, 28);
  ctx.fillStyle = withAlpha(t.panel, 0.95);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(255,255,255,.1)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ["#FF5F57", "#FEBC2E", "#28C840"].forEach((c, i) => {
    ctx.beginPath();
    ctx.arc(wx + 34 + i * 26, wy + 32, 8, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
  });
  const row = (y: number, w: number, fill: string, r = 12, h = 26) => {
    roundRect(ctx, wx + 40, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
  };
  // Highlighted action row with the step's wording.
  roundRect(ctx, wx + 40, wy + 72, ww - 80, 70, 16);
  ctx.fillStyle = t.accent;
  ctx.fill();
  ctx.fillStyle = t.panel;
  ctx.textBaseline = "middle";
  fit(ctx, `+ ${text}`, 800, 34, ww - 140);
  ctx.fillText(`+ ${text}`, wx + 70, wy + 108);
  row(wy + 172, ww * 0.6, "rgba(255,255,255,.12)");
  row(wy + 214, ww * 0.42, "rgba(255,255,255,.08)");
  row(wy + 256, ww * 0.5, "rgba(255,255,255,.06)");
  return canvas;
}

/** Big centred title over a blurred background; the last word in the accent. */
function drawFocus(text: string, t: CardTheme) {
  const words = text.toUpperCase().split(" ");
  const lines = words.length > 1 ? [words.slice(0, -1).join(" "), words[words.length - 1]] : words;
  const canvas = new OffscreenCanvas(WIDTH, 360);
  const ctx = canvas.getContext("2d")!;
  const size = Math.min(...lines.map((l) => fit(ctx, l, 900, 140, 940)));
  font(ctx, 900, size);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,.6)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  const lh = size * 1.02;
  const top = 180 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => {
    ctx.fillStyle = i === lines.length - 1 && lines.length > 1 ? t.accent : t.text;
    ctx.fillText(l, WIDTH / 2, top + i * lh);
  });
  return canvas;
}

/** Hook title: white with the accent words coloured, plus an optional sticker. */
function drawHook(text: string, accent: string | undefined, sticker: string | undefined, t: CardTheme) {
  const canvas = new OffscreenCanvas(WIDTH, 480);
  const ctx = canvas.getContext("2d")!;
  const words = text.toUpperCase().split(" ");
  const accentWords = new Set((accent ?? "").toUpperCase().split(" ").filter(Boolean));
  // Up to two lines, split near the middle.
  const half = Math.ceil(words.length / 2);
  const lines = words.length > 3 ? [words.slice(0, half), words.slice(half)] : [words];
  const size = Math.min(...lines.map((l) => fit(ctx, l.join(" "), 900, 112, 960)));
  font(ctx, 900, size);
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  const lh = size * 1.05;
  lines.forEach((line, li) => {
    const full = line.join(" ");
    let x = (WIDTH - ctx.measureText(full).width) / 2;
    const y = 30 + size / 2 + li * lh;
    line.forEach((w, wi) => {
      const piece = wi < line.length - 1 ? `${w} ` : w;
      ctx.lineWidth = Math.round(size * 0.14);
      ctx.strokeStyle = "rgba(0,0,0,.85)";
      ctx.strokeText(piece, x, y);
      ctx.fillStyle = accentWords.has(w.replace(/[^\p{L}\p{N}₱$%]/gu, "")) || accentWords.has(w) ? t.accent : t.text;
      ctx.fillText(piece, x, y);
      x += ctx.measureText(piece).width;
    });
  });

  if (sticker) {
    const label = sticker.toUpperCase();
    const s = fit(ctx, label, 900, 50, 760);
    const tw = ctx.measureText(label).width;
    const w = tw + 56;
    const h = s * 1.5;
    const y = 30 + lines.length * lh + 36;
    ctx.save();
    ctx.translate(WIDTH / 2, y + h / 2);
    ctx.rotate(-0.035);
    ctx.shadowColor = "rgba(0,0,0,.4)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    roundRect(ctx, -w / 2, -h / 2, w, h, 12);
    ctx.fillStyle = t.accent;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#111111";
    ctx.textAlign = "center";
    font(ctx, 900, s);
    ctx.fillText(label, 0, 4);
    ctx.restore();
  }
  return canvas;
}

/** Big text pop with a marker bar behind it. */
function drawPop(text: string, t: CardTheme) {
  const canvas = new OffscreenCanvas(WIDTH, 220);
  const ctx = canvas.getContext("2d")!;
  const label = text.toUpperCase();
  const size = fit(ctx, label, 900, 108, 900);
  const w = ctx.measureText(label).width;
  const x = (WIDTH - w) / 2;
  const y = 110;
  // Marker bar, slightly tilted, behind the lower half of the words.
  ctx.save();
  ctx.translate(WIDTH / 2, y + size * 0.18);
  ctx.rotate(-0.025);
  roundRect(ctx, -w / 2 - 28, -size * 0.2, w + 56, size * 0.42, 14);
  ctx.fillStyle = t.accent;
  ctx.fill();
  ctx.restore();
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.round(size * 0.16);
  ctx.strokeStyle = "#000000";
  ctx.strokeText(label, x, y);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(label, x, y);
  return canvas;
}

/** Caption font name → canvas family and weight. */
export const FONT_CSS: Record<string, { family: string; weight: number }> = {
  "Poppins Black": { family: `"AC Poppins", "AC Anton", sans-serif`, weight: 900 },
  "Poppins ExtraBold": { family: `"AC Poppins", "AC Anton", sans-serif`, weight: 800 },
  "Poppins Bold": { family: `"AC Poppins", "AC Anton", sans-serif`, weight: 700 },
  "Poppins SemiBold": { family: `"AC Poppins", "AC Anton", sans-serif`, weight: 600 },
  Bangers: { family: `"AC Bangers", "AC Anton", sans-serif`, weight: 400 },
};

/** Plain text added in the editor: chosen font, size and colour, black outline. */
function drawText(text: string, fontName: string, size: number, color: string) {
  const f = FONT_CSS[fontName] ?? FONT_CSS["Poppins Black"];
  const px = Math.round(Math.max(0.02, Math.min(0.3, size)) * WIDTH);
  const lines = text.split("\n").slice(0, 4);
  const lh = px * 1.15;
  const canvas = new OffscreenCanvas(WIDTH, Math.ceil(lines.length * lh + px * 0.5));
  const ctx = canvas.getContext("2d")!;
  // Shrink so the widest line fits the frame.
  let s = px;
  for (; s > 16; s -= 2) {
    ctx.font = `${f.weight} ${s}px ${f.family}`;
    if (Math.max(...lines.map((l) => ctx.measureText(l).width)) <= WIDTH * 0.92) break;
  }
  ctx.font = `${f.weight} ${s}px ${f.family}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  lines.forEach((l, i) => {
    const y = px * 0.25 + lh * (i + 0.5);
    ctx.lineWidth = Math.round(s * 0.14);
    ctx.strokeStyle = "rgba(0,0,0,.9)";
    ctx.strokeText(l, WIDTH / 2, y);
    ctx.fillStyle = color;
    ctx.fillText(l, WIDTH / 2, y);
  });
  return canvas;
}

/** Draws one card as PNG bytes. */
export async function drawCard(card: CompCard, theme: CardTheme): Promise<Uint8Array> {
  await loadCardFonts();
  const canvas =
    card.kind === "pill"
      ? drawPill(card.text, theme)
      : card.kind === "step"
        ? drawStep(card.label ?? "STEP", card.text, theme)
        : card.kind === "focus"
          ? drawFocus(card.text, theme)
          : card.kind === "pop"
            ? drawPop(card.text, theme)
            : card.kind === "text"
              ? drawText(card.text, card.font ?? "Poppins Black", card.size ?? 0.08, card.color ?? "#FFFFFF")
            : drawHook(card.text, card.accent, card.sticker, theme);
  return toPng(canvas);
}
