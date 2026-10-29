import type { Metadata } from "next";
import { Prose } from "@/components/site/Prose";

export const metadata: Metadata = { title: "Credits" };

// Keep in sync with CREDITS.md. Every bundled asset must be listed here.
const LIBRARIES = [
  { name: "FFmpeg / ffmpeg.wasm", license: "LGPL / GPL (core), MIT (wrapper)", url: "https://github.com/ffmpegwasm/ffmpeg.wasm" },
  { name: "Geist font", license: "SIL Open Font License 1.1", url: "https://vercel.com/font" },
  { name: "Poppins font (captions)", license: "SIL Open Font License 1.1", url: "https://github.com/google/fonts/tree/main/ofl/poppins" },
  { name: "Bangers font (captions)", license: "SIL Open Font License 1.1", url: "https://github.com/google/fonts/tree/main/ofl/bangers" },
  { name: "Anton font (₱ symbol)", license: "SIL Open Font License 1.1", url: "https://github.com/google/fonts/tree/main/ofl/anton" },
  { name: "Lucide icons", license: "ISC", url: "https://lucide.dev" },
  { name: "shadcn/ui and Base UI", license: "MIT", url: "https://ui.shadcn.com" },
];

export default function CreditsPage() {
  return (
    <Prose title="Credits">
      <p>
        AutoCut only bundles assets whose licenses allow redistribution inside an app. The full list,
        with sources, lives in <code>CREDITS.md</code> in the project repository.
      </p>

      <h2>Software and fonts</h2>
      <ul>
        {LIBRARIES.map((l) => (
          <li key={l.name}>
            <a href={l.url} target="_blank" rel="noreferrer">{l.name}</a> — {l.license}
          </li>
        ))}
      </ul>

      <h2>Sound effects and music</h2>
      <p>
        All bundled sound effects and background music are synthesized by AutoCut itself, so they&apos;re free
        to use in your videos. Music you upload yourself stays on your device.
      </p>

      <h2>Emoji</h2>
      <p>Emoji are drawn with your device&apos;s own emoji font.</p>

      <h2>AI services</h2>
      <p>
        Speech is transcribed with Whisper, snapshots are understood by a vision model, and edits are planned by an
        open-weight language model, all running on <a href="https://groq.com" target="_blank" rel="noreferrer">Groq</a>.
      </p>
    </Prose>
  );
}
