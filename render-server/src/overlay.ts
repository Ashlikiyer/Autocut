import { z } from "zod";

/**
 * Builds a HyperFrames composition (one HTML file) for AutoCut's animated
 * overlay: captions, hook title, text pops and emoji, on a transparent
 * background. The user's video is never part of it; the browser composites
 * the rendered overlay onto the video locally.
 *
 * Follows the HyperFrames contract: one paused GSAP timeline registered on
 * window.__timelines, every timed element written in the HTML with
 * class="clip" + data-start/data-duration, nothing random or clock-based.
 */

const time = z.number().finite().min(0).max(15 * 60);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const text = (max: number) => z.string().trim().min(1).max(max);

export const overlayJobSchema = z.strictObject({
  width: z.number().int().min(240).max(2160),
  height: z.number().int().min(240).max(3840),
  fps: z.number().int().min(15).max(60).default(30),
  duration: z.number().min(0.5).max(15 * 60),
  caption: z
    .strictObject({
      font: z.enum(["Poppins Black", "Poppins ExtraBold", "Poppins SemiBold", "Bangers"]),
      /** Font size as a fraction of the shorter side. */
      size: z.number().min(0.02).max(0.15),
      color: hex,
      highlight: hex,
      outline: hex,
      uppercase: z.boolean(),
      wordHighlight: z.boolean(),
      /** Distance from the bottom as a fraction of the height. */
      marginBottom: z.number().min(0).max(0.6),
    })
    .nullable(),
  groups: z
    .array(
      z.strictObject({
        words: z
          .array(z.strictObject({ text: text(40), start: time, end: time, emphasis: z.boolean().optional() }))
          .min(1)
          .max(12),
      }),
    )
    .max(2000),
  hook: z.strictObject({ text: text(60), color: hex, font: z.string(), duration: z.number().min(0.5).max(6) }).nullable(),
  texts: z
    .array(z.strictObject({ text: text(40), start: time, end: time, style: z.enum(["bounce", "pop", "shake"]) }))
    .max(200),
  emojis: z.array(z.strictObject({ emoji: text(16), start: time, end: time })).max(200),
});
export type OverlayJob = z.infer<typeof overlayJobSchema>;

const FONT_CSS: Record<string, { family: string; weight: number }> = {
  "Poppins Black": { family: "Poppins", weight: 900 },
  "Poppins ExtraBold": { family: "Poppins", weight: 800 },
  "Poppins SemiBold": { family: "Poppins", weight: 600 },
  Bangers: { family: "Bangers", weight: 400 },
};
// Anton follows every family so characters a font lacks (₱ in Poppins) still render.
const stack = (font: string) => `"${FONT_CSS[font]?.family ?? "Poppins"}", "Anton", sans-serif`;
const weight = (font: string) => FONT_CSS[font]?.weight ?? 800;

/**
 * Font size that keeps a line of text on one line within `maxWidth`.
 * A conservative width estimate per character (wide bold fonts, uppercase).
 */
export function fitFontSize(text: string, base: number, maxWidth: number, charWidth = 0.68): number {
  const est = text.length * base * charWidth;
  return Math.max(Math.round(base * 0.5), Math.min(base, Math.floor((base * maxWidth) / Math.max(est, 1))));
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v: number) => Number(v.toFixed(3));

/** Seconds a clip is on screen, never past the end of the video. */
function span(start: number, end: number, total: number) {
  const s = Math.min(start, Math.max(0, total - 0.05));
  return { s: n(s), d: n(Math.max(0.05, Math.min(end, total) - s)) };
}

export function buildOverlayHtml(job: OverlayJob): string {
  const { width: W, height: H, duration: D } = job;
  const short = Math.min(W, H);
  const html: string[] = [];
  const js: string[] = [];

  // ---- captions ----
  const c = job.caption;
  if (c) {
    const fs = Math.round(short * c.size);
    const stroke = Math.max(2, Math.round(fs * 0.11));
    job.groups.forEach((g, gi) => {
      const first = g.words[0];
      const last = g.words[g.words.length - 1];
      const next = job.groups[gi + 1]?.words[0].start ?? Infinity;
      const { s, d } = span(Math.max(0, first.start - 0.05), Math.min(last.end + 0.25, next), D);
      const id = `cap${gi}`;
      const label = g.words.map((w) => w.text).join(" ");
      // Room for emphasis words scaling up and for the outline.
      const size = fitFontSize(c.uppercase ? label.toUpperCase() : label, fs, W * 0.8, c.font === "Bangers" ? 0.5 : 0.7);
      const words = g.words
        .map((w, wi) => {
          const t = esc(c.uppercase ? w.text.toUpperCase() : w.text);
          return `<span id="${id}w${wi}" class="w${w.emphasis ? " key" : ""}">${t}</span>`;
        })
        .join("");
      html.push(
        `<div id="${id}" class="clip cap" data-start="${s}" data-duration="${d}" data-track-index="1"><div class="line" id="${id}l" style="font-size:${size}px">${words}</div></div>`,
      );
      // Group pops in, then fades out just before its clip ends.
      js.push(
        `tl.fromTo("#${id}l",{opacity:0,scale:0.82,y:${n(fs * 0.25)}},{opacity:1,scale:1,y:0,duration:0.14,ease:"back.out(2.4)"},${s});`,
        `tl.to("#${id}l",{opacity:0,duration:0.1,ease:"power2.in"},${n(s + d - 0.1)});`,
      );
      g.words.forEach((w, wi) => {
        const sel = `#${id}w${wi}`;
        if (w.emphasis) {
          // Key words are set larger in the layout (so they never overlap their
          // neighbours) and pop with a quick tilt when spoken.
          js.push(
            `tl.fromTo("${sel}",{scale:1,rotation:0},{scale:1.12,rotation:-3,duration:0.1,ease:"back.out(3)"},${n(w.start)});`,
            `tl.to("${sel}",{scale:1,rotation:-2,duration:0.14,ease:"power2.out"},${n(w.start + 0.1)});`,
          );
        } else if (c.wordHighlight) {
          js.push(
            `tl.set("${sel}",{color:"${c.highlight}"},${n(w.start)});`,
            `tl.fromTo("${sel}",{scale:1},{scale:1.12,duration:0.08,ease:"power2.out"},${n(w.start)});`,
            `tl.to("${sel}",{scale:1,duration:0.1},${n(Math.max(w.start + 0.09, w.end))});`,
            `tl.set("${sel}",{color:"${c.color}"},${n(Math.max(w.start + 0.09, w.end))});`,
          );
        }
      });
    });
    html.unshift(`<style>
      .cap{position:absolute;left:0;right:0;bottom:${Math.round(H * c.marginBottom)}px;text-align:center;overflow:visible;z-index:2}
      .cap .line{display:inline-block;max-width:${Math.round(W * 0.86)}px;transform-origin:50% 100%;
        font-family:${stack(c.font)};font-weight:${weight(c.font)};font-size:${fs}px;line-height:1.15;color:${c.color};
        -webkit-text-stroke:${stroke}px ${c.outline};paint-order:stroke fill;
        text-shadow:0 ${Math.round(fs * 0.07)}px 0 rgba(0,0,0,.45)}
      .cap .line{white-space:nowrap}
      .cap .w{display:inline-block;transform-origin:50% 70%;margin:0 0.13em}
      .cap .key{color:${c.highlight};font-size:1.12em;margin:0 0.2em}
    </style>`);
  }

  // ---- hook title ----
  if (job.hook) {
    const h = job.hook;
    const { s, d } = span(0.1, h.duration, D);
    const fs = Math.round(short * 0.066);
    html.push(
      `<div id="hook" class="clip" data-start="${s}" data-duration="${d}" data-track-index="2"><div id="hookbox" class="hookbox" style="font-size:${fitFontSize(h.text.toUpperCase(), fs, W * 0.74)}px">${esc(h.text.toUpperCase())}</div></div>`,
    );
    html.unshift(`<style>
      #hook{position:absolute;left:0;right:0;top:${Math.round(H * 0.1)}px;text-align:center;overflow:visible;z-index:3}
      .hookbox{display:inline-block;white-space:nowrap;padding:${Math.round(fs * 0.28)}px ${Math.round(fs * 0.5)}px;
        background:${h.color};color:#111;border-radius:${Math.round(fs * 0.22)}px;
        font-family:${stack(h.font)};font-weight:${weight(h.font)};font-size:${fs}px;line-height:1.1;
        box-shadow:0 ${Math.round(fs * 0.12)}px 0 rgba(0,0,0,.35)}
    </style>`);
    js.push(
      `tl.fromTo("#hookbox",{opacity:0,y:-${fs},scale:0.6,rotation:-8},{opacity:1,y:0,scale:1,rotation:-2,duration:0.38,ease:"back.out(2.2)"},${s});`,
      `tl.fromTo("#hookbox",{rotation:-2},{rotation:1,duration:${n(Math.max(0.2, d - 0.6))},ease:"sine.inOut"},${n(s + 0.38)});`,
      `tl.to("#hookbox",{opacity:0,scale:0.85,duration:0.18,ease:"power2.in"},${n(s + d - 0.18)});`,
    );
  }

  // ---- text pops ----
  if (job.texts.length) {
    const fs = Math.round(short * 0.1);
    const accent = c?.highlight ?? "#C8FF2E";
    html.unshift(`<style>
      .pop{position:absolute;left:0;right:0;top:${Math.round(H * 0.28)}px;text-align:center;overflow:visible;z-index:4}
      .pop .ptxt{display:inline-block;position:relative;white-space:nowrap;
        font-family:${stack(c?.font ?? "Poppins Black")};font-weight:900;font-size:${fs}px;line-height:1.05;color:#fff;
        -webkit-text-stroke:${Math.round(fs * 0.1)}px #000;paint-order:stroke fill;text-shadow:0 ${Math.round(fs * 0.08)}px 0 rgba(0,0,0,.5)}
      .pop .bar{position:absolute;left:-4%;right:-4%;bottom:6%;height:38%;background:${accent};z-index:-1;
        transform-origin:0 50%;border-radius:${Math.round(fs * 0.12)}px}
    </style>`);
    job.texts.forEach((t, i) => {
      const { s, d } = span(t.start, t.end, D);
      const id = `pop${i}`;
      const size = fitFontSize(t.text.toUpperCase(), fs, W * 0.8);
      html.push(
        `<div id="${id}" class="clip pop" data-start="${s}" data-duration="${d}" data-track-index="3"><div class="ptxt" id="${id}t" style="font-size:${size}px"><span class="bar" id="${id}b"></span>${esc(t.text.toUpperCase())}</div></div>`,
      );
      // A marker bar sweeps in behind the words.
      js.push(`tl.fromTo("#${id}b",{scaleX:0},{scaleX:1,duration:0.22,ease:"power3.out"},${n(s + 0.08)});`);
      if (t.style === "bounce") {
        js.push(
          `tl.fromTo("#${id}t",{opacity:0,scale:0.3,rotation:-10},{opacity:1,scale:1.15,rotation:-3,duration:0.16,ease:"power3.out"},${s});`,
          `tl.to("#${id}t",{scale:1,duration:0.14,ease:"back.out(3)"},${n(s + 0.16)});`,
        );
      } else if (t.style === "pop") {
        js.push(`tl.fromTo("#${id}t",{opacity:0,y:${fs}},{opacity:1,y:0,duration:0.2,ease:"back.out(2)"},${s});`);
      } else {
        js.push(`tl.fromTo("#${id}t",{opacity:0,x:0},{opacity:1,duration:0.06},${s});`);
        [16, -14, 10, -6, 0].forEach((x, k) => js.push(`tl.to("#${id}t",{x:${x},duration:0.05},${n(s + 0.06 + k * 0.05)});`));
      }
      js.push(`tl.to("#${id}t",{opacity:0,y:-${Math.round(fs * 0.3)},duration:0.16,ease:"power2.in"},${n(s + d - 0.16)});`);
    });
  }

  // ---- emoji ----
  if (job.emojis.length) {
    const size = Math.round(short * 0.17);
    html.unshift(`<style>
      .emo{position:absolute;left:0;right:0;top:${Math.round(H * 0.33)}px;text-align:center;overflow:visible;z-index:5}
      .emo span{display:inline-block;font-size:${size}px;line-height:1;
        font-family:"Noto Color Emoji","Segoe UI Emoji","Apple Color Emoji",sans-serif;
        filter:drop-shadow(0 ${Math.round(size * 0.06)}px 0 rgba(0,0,0,.35))}
    </style>`);
    job.emojis.forEach((e, i) => {
      const { s, d } = span(e.start, e.end, D);
      const id = `emo${i}`;
      html.push(
        `<div id="${id}" class="clip emo" data-start="${s}" data-duration="${d}" data-track-index="4"><span id="${id}e">${esc(e.emoji)}</span></div>`,
      );
      js.push(
        `tl.fromTo("#${id}e",{scale:0,rotation:-25,y:0},{scale:1.25,rotation:10,duration:0.18,ease:"power3.out"},${s});`,
        `tl.to("#${id}e",{scale:1,rotation:0,duration:0.18,ease:"back.out(3)"},${n(s + 0.18)});`,
        `tl.to("#${id}e",{y:-${Math.round(size * 0.15)},duration:${n(Math.max(0.1, d - 0.55))},ease:"sine.inOut"},${n(s + 0.36)});`,
        `tl.to("#${id}e",{scale:0,duration:0.16,ease:"back.in(2)"},${n(s + d - 0.16)});`,
      );
    });
  }

  const styles = html.filter((h) => h.startsWith("<style>"));
  const body = html.filter((h) => !h.startsWith("<style>"));

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      @font-face{font-family:"Poppins";font-weight:600;src:url("assets/fonts/Poppins-SemiBold.ttf")}
      @font-face{font-family:"Poppins";font-weight:700;src:url("assets/fonts/Poppins-Bold.ttf")}
      @font-face{font-family:"Poppins";font-weight:800;src:url("assets/fonts/Poppins-ExtraBold.ttf")}
      @font-face{font-family:"Poppins";font-weight:900;src:url("assets/fonts/Poppins-Black.ttf")}
      @font-face{font-family:"Bangers";src:url("assets/fonts/Bangers-Regular.ttf")}
      @font-face{font-family:"Anton";src:url("assets/fonts/Anton-Regular.ttf")}
      *{margin:0;padding:0;box-sizing:border-box}
      html,body{width:${W}px;height:${H}px;overflow:hidden;background:transparent}
      #root{position:relative;width:100%;height:100%}
    </style>
    ${styles.join("\n    ")}
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${n(D)}" data-width="${W}" data-height="${H}">
      ${body.join("\n      ")}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      ${js.join("\n      ")}
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
`;
}
