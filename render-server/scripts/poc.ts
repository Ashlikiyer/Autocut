// Proof of concept: render a sample overlay with HyperFrames, then composite
// it onto a test video exactly like the browser would (ffmpeg.wasm), and save
// a few frames to look at.
//   npm run poc -- <output dir>
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderOverlay } from "../src/render.ts";
import type { OverlayJob } from "../src/overlay.ts";

const outDir = process.argv[2] ?? "poc-output";
mkdirSync(outDir, { recursive: true });

const words = "I made ₱10,000 in one week and honestly it changed my whole life".split(" ");
const timed = words.map((w, i) => ({ text: w, start: 0.4 + i * 0.45, end: 0.75 + i * 0.45 }));
const key = new Set(["₱10,000", "changed"]);
const groups: OverlayJob["groups"] = [];
for (let i = 0; i < timed.length; i += 3) {
  groups.push({ words: timed.slice(i, i + 3).map((w) => ({ ...w, ...(key.has(w.text) ? { emphasis: true } : {}) })) });
}

const job: OverlayJob = {
  width: 1080,
  height: 1920,
  fps: 30,
  duration: 7,
  caption: {
    font: "Poppins Black",
    size: 0.072,
    color: "#FFFFFF",
    highlight: "#C8FF2E",
    outline: "#000000",
    uppercase: true,
    wordHighlight: true,
    marginBottom: 0.22,
  },
  groups,
  hook: { text: "₱10K in 1 week?!", color: "#C8FF2E", font: "Poppins Black", duration: 2.6 },
  texts: [{ text: "₱10,000 IN 1 WEEK", start: 1.3, end: 2.9, style: "bounce" }],
  emojis: [{ emoji: "🤯", start: 4.6, end: 5.9 }],
};

const { webm, seconds } = await renderOverlay(job);
writeFileSync(join(outDir, "overlay.webm"), webm);
console.log(`overlay: ${(webm.length / 1024).toFixed(0)} KB in ${seconds.toFixed(1)} s`);

// Composite in ffmpeg.wasm (the same core the web app uses).
const root = join(process.cwd(), "..", "node_modules", "@ffmpeg", "core", "dist", "umd") + "/";
(globalThis as Record<string, unknown>).self = globalThis;
(globalThis as Record<string, unknown>).location = { href: "file:///" + root.replace(/\\/g, "/") };
const require = createRequire(import.meta.url);
const core = await require(root + "ffmpeg-core.js")({ wasmBinary: readFileSync(root + "ffmpeg-core.wasm") });
core.setLogger(() => {});
const exec = (...a: string[]) => {
  core.exec(...a);
  const r = core.ret;
  core.reset();
  if (r !== 0) throw new Error(`ffmpeg failed: ${a.join(" ")}`);
};
core.FS.writeFile("/ov.webm", webm);
exec("-f", "lavfi", "-i", "testsrc2=s=1080x1920:r=30:d=7", "-c:v", "libx264", "-preset", "ultrafast", "-y", "/base.mp4");
const t0 = Date.now();
exec("-i", "/base.mp4", "-c:v", "libvpx-vp9", "-i", "/ov.webm", "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto", "-c:v", "libx264", "-preset", "ultrafast", "-y", "/out.mp4");
console.log(`composite in ffmpeg.wasm: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
writeFileSync(join(outDir, "composite.mp4"), core.FS.readFile("/out.mp4"));
for (const t of ["0.6", "1.5", "2.2", "3.9", "5.0", "6.4"]) {
  exec("-ss", t, "-i", "/out.mp4", "-frames:v", "1", "-update", "1", "-y", "/f.png");
  writeFileSync(join(outDir, `frame-${t}.png`), core.FS.readFile("/f.png"));
}
console.log("frames written to", outDir);
