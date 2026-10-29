// Measures overlay render time for a few lengths and sizes.
//   npx tsx scripts/bench.ts
import { renderOverlay } from "../src/render.ts";
import type { OverlayJob } from "../src/overlay.ts";

function job(duration: number, width: number, height: number): OverlayJob {
  const groups: OverlayJob["groups"] = [];
  for (let t = 0.3; t + 1.4 < duration; t += 1.5) {
    groups.push({
      words: ["this", "is", "great"].map((w, i) => ({ text: w, start: t + i * 0.45, end: t + i * 0.45 + 0.4 })),
    });
  }
  return {
    width,
    height,
    fps: 30,
    duration,
    caption: {
      font: "Poppins Black", size: 0.072, color: "#FFFFFF", highlight: "#C8FF2E", outline: "#000000",
      uppercase: true, wordHighlight: true, marginBottom: 0.22,
    },
    groups,
    hook: { text: "Watch this", color: "#C8FF2E", font: "Poppins Black", duration: 2.5 },
    texts: [{ text: "BIG NUMBER", start: 4, end: 5.4, style: "bounce" }],
    emojis: [{ emoji: "🔥", start: 6, end: 7.2 }],
  };
}

for (const [d, w, h] of [[7, 1080, 1920], [30, 1080, 1920], [30, 720, 1280]] as const) {
  const r = await renderOverlay(job(d, w, h));
  console.log(`${d}s @ ${w}x${h}: ${r.seconds.toFixed(1)} s render, ${(r.webm.length / 1024).toFixed(0)} KB, ${(r.seconds / d).toFixed(2)}x realtime`);
}
