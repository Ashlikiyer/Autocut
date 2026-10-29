import { z } from "zod";
import { fitFontSize } from "./overlay.ts";

/**
 * HyperFrames composition for AutoCut's "hero" cards (hook, pills, step cards,
 * focus titles). Only the cards are rendered, back to back on one compact
 * timeline, on a transparent background; the browser drops each segment into
 * place over the video. The user's video is never sent here.
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const text = (max: number) => z.string().trim().min(1).max(max);

export const cardsJobSchema = z.strictObject({
  width: z.number().int().min(240).max(2160),
  height: z.number().int().min(240).max(3840),
  fps: z.number().int().min(15).max(60).default(30),
  theme: z.strictObject({ panel: hex, accent: hex, text: hex }),
  cards: z
    .array(
      z.strictObject({
        kind: z.enum(["hook", "pill", "step", "focus", "pop"]),
        style: z.enum(["bounce", "pop", "shake"]).optional(),
        text: text(60),
        label: text(14).optional(),
        accent: text(24).optional(),
        sticker: text(28).optional(),
        duration: z.number().min(0.5).max(6),
      }),
    )
    .min(1)
    .max(40),
});
export type CardsJob = z.infer<typeof cardsJobSchema>;

export interface Segment {
  /** Where this card starts in the rendered overlay (seconds). */
  offset: number;
  duration: number;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v: number) => Number(v.toFixed(3));
/** Gap between segments so a fade-out never bleeds into the next card. */
const GAP = 0.1;
const FAMILY = `"Poppins", "Anton", sans-serif`;

export function buildCardsHtml(job: CardsJob): { html: string; segments: Segment[]; duration: number } {
  const { width: W, height: H, theme: t } = job;
  const s = W / 1080;
  const px = (v: number) => `${Math.round(v * s)}px`;
  const body: string[] = [];
  const js: string[] = [];
  const segments: Segment[] = [];
  let offset = 0;

  job.cards.forEach((card, i) => {
    const id = `c${i}`;
    const at = n(offset);
    const d = n(card.duration);
    const out = n(at + d - 0.25);
    segments.push({ offset: at, duration: d });
    offset += d + GAP;

    if (card.kind === "pill") {
      const label = card.text.toUpperCase();
      const size = fitFontSize(label, 30, 840, 0.72);
      body.push(`<div id="${id}" class="clip pillwrap" data-start="${at}" data-duration="${d}" data-track-index="1">
        <div class="pill" id="${id}p">
          <span class="ic" id="${id}i"><svg viewBox="0 0 24 24" width="${Math.round(22 * s)}" height="${Math.round(22 * s)}"><path id="${id}k" d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="${t.panel}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="24" stroke-dashoffset="24"/></svg></span>
          <span class="ptx" id="${id}t" style="font-size:${px(size)}">${esc(label)}</span>
        </div></div>`);
      js.push(
        `tl.fromTo("#${id}p",{opacity:0,y:${-40 * s},scale:0.8},{opacity:1,y:0,scale:1,duration:0.38,ease:"back.out(2)"},${at});`,
        `tl.fromTo("#${id}i",{scale:0,rotation:-120},{scale:1,rotation:0,duration:0.3,ease:"back.out(3)"},${n(at + 0.15)});`,
        `tl.fromTo("#${id}k",{attr:{"stroke-dashoffset":24}},{attr:{"stroke-dashoffset":0},duration:0.25,ease:"power2.out"},${n(at + 0.32)});`,
        `tl.fromTo("#${id}t",{clipPath:"inset(0 100% 0 0)"},{clipPath:"inset(0 0% 0 0)",duration:0.4,ease:"power3.out"},${n(at + 0.22)});`,
        `tl.to("#${id}p",{opacity:0,y:${-18 * s},duration:0.25,ease:"power2.in"},${out});`,
      );
    }

    if (card.kind === "step") {
      const label = `${(card.label ?? "STEP").toUpperCase()}:`;
      const words = card.text.toUpperCase().split(" ");
      const size = fitFontSize(`${label} ${card.text.toUpperCase()}`, 84, 960, 0.66);
      const sparks = [-1, 0, 1]
        .map((k) => `<span class="spark" id="${id}s${k + 1}" style="transform:rotate(${k * 28}deg)"></span>`)
        .join("");
      body.push(`<div id="${id}" class="clip stepwrap" data-start="${at}" data-duration="${d}" data-track-index="1">
        <div class="head" style="font-size:${px(size)}">
          <span class="lbl" id="${id}l">${esc(label)}</span>
          <span class="act">${sparks ? `<span class="sparks">${sparks}</span>` : ""}${words
            .map((w, k) => `<span class="aw" id="${id}w${k}">${esc(w)}</span>`)
            .join(" ")}</span>
        </div>
        <div class="win" id="${id}win">
          <div class="dots"><i style="background:#FF5F57"></i><i style="background:#FEBC2E"></i><i style="background:#28C840"></i></div>
          <div class="row" id="${id}row"><span id="${id}rt">+ ${esc(card.text)}</span></div>
          <div class="sk" id="${id}b0" style="width:60%"></div>
          <div class="sk" id="${id}b1" style="width:42%"></div>
          <div class="sk" id="${id}b2" style="width:50%"></div>
          <svg class="cursor" id="${id}cur" viewBox="0 0 24 24" width="${Math.round(54 * s)}" height="${Math.round(54 * s)}"><path d="M4 2l15 11-7 1 4 8-3 1-4-8-5 5z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>
        </div></div>`);
      js.push(
        `tl.fromTo("#${id}l",{opacity:0,x:${-50 * s}},{opacity:1,x:0,duration:0.3,ease:"power3.out"},${at});`,
        ...words.map(
          (_, k) =>
            `tl.fromTo("#${id}w${k}",{opacity:0,y:${50 * s},rotation:6},{opacity:1,y:0,rotation:0,duration:0.32,ease:"back.out(2.2)"},${n(at + 0.08 + k * 0.07)});`,
        ),
        ...[0, 1, 2].map(
          (k) => `tl.fromTo("#${id}s${k}",{scaleY:0},{scaleY:1,duration:0.2,ease:"power2.out"},${n(at + 0.3 + k * 0.05)});`,
        ),
        `tl.fromTo("#${id}win",{opacity:0,y:${80 * s},scale:0.94},{opacity:1,y:0,scale:1,duration:0.4,ease:"back.out(1.6)"},${n(at + 0.25)});`,
        `tl.fromTo("#${id}row",{scaleX:0},{scaleX:1,duration:0.35,ease:"power3.out"},${n(at + 0.55)});`,
        `tl.fromTo("#${id}rt",{opacity:0},{opacity:1,duration:0.2},${n(at + 0.75)});`,
        ...[0, 1, 2].map(
          (k) => `tl.fromTo("#${id}b${k}",{scaleX:0},{scaleX:1,duration:0.3,ease:"power2.out"},${n(at + 0.6 + k * 0.08)});`,
        ),
        // A cursor glides to the highlighted row and clicks it.
        `tl.fromTo("#${id}cur",{opacity:0,x:${300 * s},y:${220 * s}},{opacity:1,x:0,y:0,duration:0.55,ease:"power2.inOut"},${n(at + 0.8)});`,
        `tl.fromTo("#${id}cur",{scale:1},{scale:0.82,duration:0.08,yoyo:true,repeat:1},${n(at + 1.4)});`,
        `tl.fromTo("#${id}row",{filter:"brightness(1)"},{filter:"brightness(1.25)",duration:0.1,yoyo:true,repeat:1},${n(at + 1.42)});`,
        `tl.to("#${id}",{opacity:0,y:${-30 * s},duration:0.25,ease:"power2.in"},${out});`,
      );
    }

    if (card.kind === "focus") {
      const words = card.text.toUpperCase().split(" ");
      const lines = words.length > 1 ? [words.slice(0, -1).join(" "), words[words.length - 1]] : words;
      const size = Math.min(...lines.map((l) => fitFontSize(l, 150, 940, 0.68)));
      body.push(`<div id="${id}" class="clip focuswrap" data-start="${at}" data-duration="${d}" data-track-index="1">
        ${lines
          .map(
            (l, k) =>
              `<div class="fl${k === lines.length - 1 && lines.length > 1 ? " acc" : ""}" id="${id}f${k}" style="font-size:${px(size)}">${esc(l)}</div>`,
          )
          .join("")}
      </div>`);
      js.push(
        `tl.fromTo("#${id}f0",{opacity:0,scale:1.6,filter:"blur(14px)"},{opacity:1,scale:1,filter:"blur(0px)",duration:0.32,ease:"power3.out"},${at});`,
      );
      if (lines.length > 1) {
        js.push(
          `tl.fromTo("#${id}f1",{opacity:0,scale:2.3},{opacity:1,scale:1,duration:0.3,ease:"back.out(1.8)"},${n(at + 0.2)});`,
          ...[10, -8, 5, 0].map((x, k) => `tl.to("#${id}f1",{x:${x * s},duration:0.04},${n(at + 0.5 + k * 0.04)});`),
        );
      }
      js.push(`tl.to("#${id}",{opacity:0,scale:0.92,duration:0.25,ease:"power2.in"},${out});`);
    }

    if (card.kind === "pop") {
      const label = card.text.toUpperCase();
      const size = fitFontSize(label, 108, 900, 0.7);
      body.push(`<div id="${id}" class="clip popwrap" data-start="${at}" data-duration="${d}" data-track-index="1">
        <div class="ptxt2" id="${id}t" style="font-size:${px(size)}"><span class="bar2" id="${id}b"></span>${esc(label)}</div>
      </div>`);
      js.push(`tl.fromTo("#${id}b",{scaleX:0},{scaleX:1,duration:0.24,ease:"power3.out"},${n(at + 0.08)});`);
      if (card.style === "shake") {
        js.push(`tl.fromTo("#${id}t",{opacity:0,scale:1.3},{opacity:1,scale:1,duration:0.12},${at});`);
        [18, -16, 12, -7, 0].forEach((x, k) => js.push(`tl.to("#${id}t",{x:${x * s},duration:0.05},${n(at + 0.12 + k * 0.05)});`));
      } else if (card.style === "pop") {
        js.push(`tl.fromTo("#${id}t",{opacity:0,y:${90 * s}},{opacity:1,y:0,duration:0.24,ease:"back.out(2.2)"},${at});`);
      } else {
        js.push(
          `tl.fromTo("#${id}t",{opacity:0,scale:0.3,rotation:-12},{opacity:1,scale:1.15,rotation:-3,duration:0.16,ease:"power3.out"},${at});`,
          `tl.to("#${id}t",{scale:1,duration:0.14,ease:"back.out(3)"},${n(at + 0.16)});`,
        );
      }
      js.push(`tl.to("#${id}t",{opacity:0,y:${-30 * s},duration:0.2,ease:"power2.in"},${n(at + d - 0.2)});`);
    }

    if (card.kind === "hook") {
      const words = card.text.toUpperCase().split(" ");
      const accent = new Set((card.accent ?? "").toUpperCase().split(" ").filter(Boolean));
      const half = Math.ceil(words.length / 2);
      const lines = words.length > 3 ? [words.slice(0, half), words.slice(half)] : [words];
      const size = Math.min(...lines.map((l) => fitFontSize(l.join(" "), 112, 960, 0.66)));
      let k = 0;
      body.push(`<div id="${id}" class="clip hookwrap" data-start="${at}" data-duration="${d}" data-track-index="1">
        ${lines
          .map(
            (line) =>
              `<div class="hl" style="font-size:${px(size)}">${line
                .map((w) => `<span class="hw${accent.has(w) ? " acc" : ""}" id="${id}h${k++}">${esc(w)}</span>`)
                .join(" ")}</div>`,
          )
          .join("")}
        ${card.sticker ? `<div class="stk" id="${id}st" style="font-size:${px(fitFontSize(card.sticker.toUpperCase(), 50, 760, 0.7))}">${esc(card.sticker.toUpperCase())}</div>` : ""}
      </div>`);
      for (let j = 0; j < k; j++) {
        js.push(
          `tl.fromTo("#${id}h${j}",{opacity:0,y:${60 * s},scale:0.5,rotation:8},{opacity:1,y:0,scale:1,rotation:0,duration:0.34,ease:"back.out(2.4)"},${n(at + j * 0.08)});`,
        );
      }
      if (card.sticker) {
        const st = n(at + 0.15 + k * 0.08);
        js.push(
          `tl.fromTo("#${id}st",{opacity:0,scale:2.4,rotation:-22},{opacity:1,scale:1,rotation:-3,duration:0.3,ease:"back.out(2.2)"},${st});`,
          `tl.fromTo("#${id}st",{rotation:-3},{rotation:-1,duration:${n(Math.max(0.2, out - st - 0.3))},ease:"sine.inOut"},${n(st + 0.3)});`,
        );
      }
      js.push(`tl.to("#${id}",{opacity:0,y:${-24 * s},duration:0.25,ease:"power2.in"},${out});`);
    }
  });

  const total = n(Math.max(0.5, offset - GAP));
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      @font-face{font-family:"Poppins";font-weight:700;src:url("assets/fonts/Poppins-Bold.ttf")}
      @font-face{font-family:"Poppins";font-weight:800;src:url("assets/fonts/Poppins-ExtraBold.ttf")}
      @font-face{font-family:"Poppins";font-weight:900;src:url("assets/fonts/Poppins-Black.ttf")}
      @font-face{font-family:"Anton";src:url("assets/fonts/Anton-Regular.ttf")}
      *{margin:0;padding:0;box-sizing:border-box}
      html,body{width:${W}px;height:${H}px;overflow:hidden;background:transparent}
      #root{position:relative;width:100%;height:100%;font-family:${FAMILY};color:${t.text}}
      .acc{color:${t.accent}}
      .pillwrap{position:absolute;left:0;right:0;top:${Math.round(H * 0.065)}px;text-align:center}
      .pill{display:inline-flex;align-items:center;gap:${px(14)};padding:${px(14)} ${px(30)} ${px(14)} ${px(18)};
        border-radius:999px;background:${t.panel}eb;border:${px(2)} solid rgba(255,255,255,.12);box-shadow:0 ${px(6)} ${px(18)} rgba(0,0,0,.35)}
      .ic{display:inline-grid;place-items:center;width:${px(40)};height:${px(40)};border-radius:50%;background:${t.accent}}
      .ptx{font-weight:800;letter-spacing:.02em;white-space:nowrap}
      .stepwrap{position:absolute;left:0;right:0;top:${Math.round(H * 0.11)}px;text-align:center}
      .head{font-weight:900;white-space:nowrap;line-height:1.1;text-shadow:0 ${px(6)} ${px(16)} rgba(0,0,0,.55)}
      .lbl{display:inline-block;font-size:.62em;margin-right:.25em}
      .act{position:relative;display:inline-block;color:${t.accent}}
      .aw{display:inline-block}
      .sparks{position:absolute;left:50%;top:${px(-40)};width:0;height:0}
      .spark{position:absolute;left:${px(-3)};top:0;width:${px(6)};height:${px(24)};border-radius:${px(3)};background:${t.accent};transform-origin:50% ${px(56)}}
      .win{position:relative;margin:${px(36)} auto 0;width:${px(860)};padding:${px(64)} ${px(40)} ${px(36)};text-align:left;
        border-radius:${px(28)};background:${t.panel}f2;border:${px(2)} solid rgba(255,255,255,.1);box-shadow:0 ${px(12)} ${px(36)} rgba(0,0,0,.45)}
      .dots{position:absolute;left:${px(26)};top:${px(24)};display:flex;gap:${px(10)}}
      .dots i{display:block;width:${px(16)};height:${px(16)};border-radius:50%}
      .row{height:${px(70)};border-radius:${px(16)};background:${t.accent};color:${t.panel};font-weight:800;font-size:${px(32)};
        display:flex;align-items:center;padding:0 ${px(28)};transform-origin:0 50%;white-space:nowrap;overflow:hidden}
      .sk{height:${px(24)};border-radius:${px(12)};background:rgba(255,255,255,.1);margin-top:${px(18)};transform-origin:0 50%}
      .cursor{position:absolute;left:${px(520)};top:${px(110)};filter:drop-shadow(0 ${px(4)} ${px(6)} rgba(0,0,0,.4))}
      .focuswrap{position:absolute;left:0;right:0;top:${Math.round(H * 0.4)}px;text-align:center}
      .fl{font-weight:900;line-height:1;white-space:nowrap;text-shadow:0 ${px(8)} ${px(26)} rgba(0,0,0,.6)}
      .hookwrap{position:absolute;left:0;right:0;top:${Math.round(H * 0.085)}px;text-align:center}
      .hl{font-weight:900;line-height:1.05;white-space:nowrap;-webkit-text-stroke:${px(12)} rgba(0,0,0,.85);paint-order:stroke fill}
      .hw{display:inline-block}
      .popwrap{position:absolute;left:0;right:0;top:${Math.round(H * 0.26)}px;text-align:center}
      .ptxt2{display:inline-block;position:relative;font-weight:900;white-space:nowrap;line-height:1.05;color:#fff;
        -webkit-text-stroke:${px(16)} #000;paint-order:stroke fill}
      .bar2{position:absolute;left:-4%;right:-4%;bottom:8%;height:40%;background:${t.accent};z-index:-1;transform-origin:0 50%;
        border-radius:${px(14)};transform:rotate(-1.5deg)}
      .stk{display:inline-block;margin-top:${px(30)};padding:${px(10)} ${px(28)};border-radius:${px(12)};background:${t.accent};
        color:#111;font-weight:900;box-shadow:0 ${px(6)} ${px(16)} rgba(0,0,0,.4)}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${W}" data-height="${H}">
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
  return { html, segments, duration: total };
}
