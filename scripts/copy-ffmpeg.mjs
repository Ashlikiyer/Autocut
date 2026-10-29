// Copies the ffmpeg.wasm class worker and core files into public/ffmpeg so they
// are served from our own origin (required by COEP: require-corp).
// Runs automatically before `dev` and `build`.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "ffmpeg");

const copies = [
  // Class worker (+ the modules it imports)
  ["@ffmpeg/ffmpeg/dist/esm", "class"],
  // Multithreaded core (used when the page is cross-origin isolated)
  ["@ffmpeg/core-mt/dist/esm", "mt"],
  // Single-threaded core (fallback)
  ["@ffmpeg/core/dist/esm", "st"],
];

for (const [from, to] of copies) {
  const src = join(root, "node_modules", from);
  if (!existsSync(src)) {
    console.error(`[copy-ffmpeg] missing ${src}, run npm install`);
    process.exit(1);
  }
  const dest = join(out, to);
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
}

console.log("[copy-ffmpeg] ffmpeg files copied to public/ffmpeg");
