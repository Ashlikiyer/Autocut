# AutoCut

Free, browser-based auto-editor for short-form video. Upload a talking video, AutoCut cuts the pauses, and you download the MP4. The video never leaves the device; only a small compressed audio file is sent for transcription.

See `AutoCut — Project Documentation.md` for the full spec and roadmap.

## Status: Phases 1–3

**Creator style** (modelled on a reference edit)
- One-word captions, mid-frame
- AI-picked context pills ("₱0 · WALANG PAID COURSE"), STEP cards with a mock app window, focus titles over a blurred background, two-tone hook with sticker
- Cards are drawn in the browser (Canvas) and animated by ffmpeg.wasm
- Jump-cut zoom: alternating close/wide framing at each cut
- **HyperFrames motion (optional):** `render-server/` animates the hook, pills, step cards and focus titles with HyperFrames + GSAP and returns a transparent WebM that ffmpeg.wasm composites in the browser. It receives only card text and timings, never the video. Without it, cards are drawn in the browser.
  ```bash
  cd render-server && npm install && npm start   # http://localhost:4100
  ```
  Set `NEXT_PUBLIC_OVERLAY_URL=http://localhost:4100` (restart `npm run dev`). For production, host it (e.g. an Oracle Cloud Always Free VM) and set `ALLOWED_ORIGINS` to your site.
- Database: run `supabase/migrations/002_creator_preset.sql` to allow the new style

**Phase 2–3 (editing features)**
- Style presets: Energetic, Clean, Funny, Podcast
- Animated word-by-word captions (ASS subtitles, Poppins / Bangers fonts)
- Filler-word removal (English + Filipino: um, uh, ano, parang, standalone "like", "you know", sentence-start "kasi")
- Vertical 9:16 crop
- AI director (`/api/plan`, Groq `openai/gpt-oss-120b`) plans zooms, emoji, text pops, SFX, hook title and music mood; validated with Zod and capped per preset, with a rule-based fallback
- Flash transitions with whooshes, camera shake (Funny), progress bar
- 12 synthesized SFX and 4 synthesized music loops (`npm run make:sfx`, `npm run make:music`), or upload your own music; music auto-ducks under speech
- Loudness normalization (-14 LUFS) on export
- Effects are applied to edits up to 3 minutes long

**Phase 1 (MVP)**

- Upload with length (15 min), size (500 MB) and format (MP4/MOV/WebM) checks
- ffmpeg.wasm in the browser (multithreaded when cross-origin isolated)
- Audio extraction to mono 16 kHz Opus, chunked under 4 MB
- `/api/transcribe` → Groq Whisper with word timestamps
- Silence cutting from word gaps, with ffmpeg `silencedetect` as a second check
- 480p preview render, full-quality render on download
- `/api/session` daily limit (3/day anonymous) with Supabase usage logs
- `/api/feedback` ratings

## Setup

Requires Node.js 20+, a free [Groq](https://console.groq.com) account and a free [Supabase](https://supabase.com) project.

```bash
npm install
cp .env.example .env.local   # fill in the keys
npm run dev                  # http://localhost:3000 in desktop Chrome
```

1. Run `supabase/schema.sql` in the Supabase SQL editor (creates tables + RLS).
2. `npm run dev` and `npm run build` copy the ffmpeg.wasm files into `public/ffmpeg` automatically (`npm run copy:ffmpeg`).
3. Without Supabase keys, local dev runs with no daily limit and no logging. In production, missing keys return `UPSTREAM_ERROR`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm test` | Unit tests (Vitest) for the engine and schemas |
| `npm run lint` | ESLint |

## Layout

```text
app/             pages + API routes (session, transcribe, feedback)
components/      upload, style-picker, progress, preview, editor
hooks/           useFFmpeg (load once), usePipeline (runs all stages)
lib/engine/      pure media engine: cuts, edl, filtergraph, audio, render, probe
lib/ai/groq.ts   server-side Groq client
supabase/        schema.sql
```

## Deploy

Push to GitHub, import in Vercel, add the env vars, then check `self.crossOriginIsolated === true` in DevTools on the live site.

### HyperFrames overlay server (optional)

The web app works without it (cards are then drawn in the browser). To get the
HyperFrames animations online, run `render-server/` as a container. It needs
about **1.2 GB of RAM** (headless Chrome) — 512 MB free tiers are too small.

Build and test locally (from the repo root, so the caption fonts are included):

```bash
docker build -f render-server/Dockerfile -t autocut-overlay .
docker run -p 4100:7860 -e ALLOWED_ORIGINS=http://localhost:3000 autocut-overlay
curl http://localhost:4100/health
```

**Free-only setup (default):** don't host it. Leave `NEXT_PUBLIC_OVERLAY_URL` unset on
Vercel and the live site draws the cards in the browser (still animated: fade, slide,
pop, bounce). HyperFrames keeps working on your own machine with `npm start`.

**Google Cloud Run** — only if you accept adding a card. It has a monthly free
allowance, but it is a billing account and usage beyond the allowance is charged:

1. Cloud Run → *Deploy container* → *Service* → *Continuously deploy from a repository*,
   connect the GitHub repo, branch `main`, build type **Dockerfile**,
   source location **`/render-server/Dockerfile`** (build context: repo root).
2. Settings: memory **2 GiB**, CPU **2**, request timeout **300 s**,
   concurrency **1**, min instances **0**, max instances **2**,
   authentication **Allow public access**.
3. Variable: `ALLOWED_ORIGINS=https://<your-app>.vercel.app` (comma-separate several).
4. In Vercel set `NEXT_PUBLIC_OVERLAY_URL=https://<service>.run.app` and **redeploy**
   (`NEXT_PUBLIC_` values are baked in at build time).
5. Add a budget alert (Billing → Budgets) so you hear about any charges.

The server renders one job at a time and answers `429 BUSY` when 4 are queued;
the app then falls back to browser-drawn cards, so the edit always finishes.
