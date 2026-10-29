# AutoCut — Project Documentation

Oct 27, 2026 · @Kurt

## Overview

AutoCut is a free web app that turns a raw video into a finished short-form edit: the user uploads, picks a style, and downloads an edited video with cuts, captions, motion effects, sound effects and music.

The core promise has three parts:

- **Free, no watermark.** Every part of the stack runs on free tiers or in the browser.
- **No editing skills needed.** An AI "director" decides what to cut and where to add effects.
- **Private by design.** The video never leaves the user's device; only a small compressed audio file is sent for transcription.

One-line pitch: *Upload your video. Get a scroll-stopping edit. Free.*

| Item | Value |
| --- | --- |
| Project type | Personal portfolio project, public web app |
| Owner | Ashley Kier Ferreol |
| Platform | Web (desktop Chrome first, mobile later) |
| Budget | ₱0 (free tiers only) |
| Primary output | MP4, 9:16 vertical, 1080×1920 |

## Problem, goals and target users

Editing one minute of short-form video by hand takes 30–60 minutes, and most auto-editing tools are paid, add watermarks, or handle Taglish speech poorly.

**Goals**

1. Produce a usable short-form edit from a raw upload with zero manual editing.
2. Keep the running cost at ₱0 while serving real users.
3. Support English and Taglish speech, including Filipino filler words.
4. Serve as a portfolio project showing AI integration, media engineering and free-tier architecture.

**Non-goals (for now)**

- A full timeline editor like CapCut or Premiere.
- Server-side video storage or cloud rendering.
- Videos longer than 15 minutes.

**Target users**

| User | Need | Typical input |
| --- | --- | --- |
| Small content creators | Fast TikTok/Reels clips without paying for tools | Vlogs, talking-head videos |
| Students and student orgs | Event recaps, org promos, school projects | Phone recordings |
| Small online sellers | Product videos for Facebook and TikTok shops | Short product demos |
| Podcasters and streamers | Highlight clips from long recordings | Podcast or stream recordings |

## Features

The MVP cuts silences and exports a clean video; each later phase adds a layer of polish on top of the same pipeline.

| Feature | What it does | Phase |
| --- | --- | --- |
| Silence cutting | Removes pauses longer than a set threshold (default 0.5 s) | 1 |
| Video export | Renders and downloads the edited MP4 | 1 |
| Animated captions | Word-by-word captions with the spoken word highlighted | 2 |
| Filler-word removal | Cuts "um", "uh", "ano", "parang" and similar | 2 |
| Vertical crop | Converts landscape video to 9:16 | 2 |
| Style presets | Energetic, Clean, Funny, Podcast | 2 |
| AI effects plan | LLM decides where zooms, emoji, text pops and SFX go | 3 |
| Zoom punch-ins | Short zooms on key lines to hold attention | 3 |
| Emoji and text pops | Animated emoji and keyword text on screen | 3 |
| Transitions | Flash, slide or whip between cuts | 3 |
| Sound effects | Whoosh, pop, ding timed to visual effects | 3 |
| Background music | Mood-based track with auto-ducking under speech | 3 |
| Loudness normalization | Consistent volume across the video | 3 |
| Progress bar overlay | Thin bar showing video progress | 3 |
| Highlight clips | AI picks the best 30–60 s moments as separate clips | 4 |
| Face-tracking crop | Vertical crop follows the speaker's face | 4 |
| Advanced motion | Lottie animations and custom motion graphics | 4 |
| Auto thumbnail | Picks a strong frame and adds hook text | 4 |

**Style presets**

| Preset | Captions | Effects density | SFX | Music |
| --- | --- | --- | --- | --- |
| Energetic | Bold, large, color pop | High (zoom every 4–6 s) | Frequent | Upbeat |
| Clean | Small, white, subtle | Low | Rare | Soft, chill |
| Funny | Bold with emoji | High, with shakes | Meme-style | Playful |
| Podcast | Medium, two-line | Very low | None | Light or none |

## User flow

A user goes from upload to download in five screens, with no account needed for the first three videos per day.

1. **Landing page.** Headline, before/after demo video, and one "Upload video" button.
2. **Upload.** Drag-and-drop or file picker. The app checks length (max 15 min), size (max 500 MB) and format (MP4, MOV, WebM).
3. **Choose style.** Pick a preset, a caption style, a music mood (or none), and toggles for filler removal and vertical crop.
4. **Processing.** A progress screen shows each stage (extracting audio, transcribing, planning edits, rendering) with a percentage and light, fun status messages.
5. **Preview and download.** The user watches the result, can switch caption style or turn effects off and re-render, then downloads the MP4. Highlight clips (Phase 4) appear as a list of separate downloads.

**Error states**

- Video too long or too large: show the limit and suggest trimming first.
- No speech detected: offer a music-only edit with cuts on scene changes (later phase) or skip captions.
- Daily limit reached: show the reset time and an optional sign-in for a higher limit.
- Browser not supported or out of memory: suggest desktop Chrome and a shorter video.

## System architecture

AutoCut is a client-heavy app: the browser does all video work, thin API routes guard the secret keys, and three free services handle AI and storage.

&#91;embedded content: AutoCut architecture · browser, API routes, free services\]

The browser sends only a compressed audio file and transcript text to the server; the server is the only part that talks to Groq and writes to Supabase.

**Free tech stack**

| Layer | Tool | Why |
| --- | --- | --- |
| Framework | Next.js (App Router) + TypeScript | UI and API routes in one project |
| UI | Tailwind CSS + shadcn/ui | Fast, consistent components |
| Video and audio processing | ffmpeg.wasm | Full ffmpeg in the browser, no server cost |
| Transcription | Groq Whisper (free tier) | Fast, word-level timestamps |
| Transcription fallback | Transformers.js Whisper | Runs in browser, no rate limits |
| AI director | Groq Llama (free tier) | Fast JSON effects plans |
| Validation | Zod | Checks API input and LLM output |
| Database and auth | Supabase (free tier) | Usage limits, optional sign-in, feedback |
| Hosting | Vercel Hobby | Free deploys, auto-deploy from GitHub |
| Face tracking (Phase 4) | MediaPipe Face Detection | Runs in browser |
| Advanced motion (Phase 4) | Canvas + WebCodecs + mp4-muxer, lottie-web | Custom animation rendering in browser |

## Processing pipeline

The pipeline has seven stages; only stages 3 and 4 leave the browser, and they send text and a small audio file, never the video.

1. **Load video (browser).** Read the file into memory with ffmpeg.wasm. Probe duration, resolution and frame rate.
2. **Extract audio (browser).** Convert to mono, 16 kHz, Opus at about 16–24 kbps. A 10-minute video becomes roughly 1–2 MB. Split into chunks under 4 MB if needed.
3. **Transcribe (server → Groq).** Send each chunk to `/api/transcribe`, which calls Groq Whisper with word-level timestamps. Merge chunk results and shift timestamps by each chunk's offset.
4. **Plan the edit (server → Groq).** Send the transcript to `/api/plan`, which asks the LLM for an effects plan as JSON (see AI editing). Validate the JSON; fall back to rule-based effects if it fails.
5. **Build the edit list (browser).** Combine silence gaps, filler words and the AI plan into one Edit Decision List (EDL): segments to keep, plus effects and sounds re-timed to the new cut timeline.
6. **Render (browser).** Generate the ASS subtitle file and an ffmpeg filter graph from the EDL. Run ffmpeg.wasm to trim, concat, crop, zoom, overlay, burn captions and mix audio.
7. **Deliver (browser).** Create a Blob URL for preview and download. Clear memory after download.

**Re-timing rule.** All effect and caption times are first stored on the original timeline, then mapped to the cut timeline: new time = original time − total length of cuts before it. Any effect that falls inside a removed segment is dropped.

## AI editing

AI does two jobs: Whisper turns speech into timed words, and an LLM acts as the "director" that plans effects. Cutting silences and fillers is rule-based, so it works even when the AI is down.

### Transcription

- Model: Groq Whisper (`whisper-large-v3-turbo`), `response_format: verbose_json`, `timestamp_granularities: ["word"]`.
- Language: auto-detect, or let the user choose English or Filipino.
- Whisper tends to drop "um" and "uh". Pass a `prompt` with fillers (for example: "Umm, so, uh, ano, parang, like...") to push it toward verbatim output.
- Fallback: Whisper in the browser via Transformers.js (slower, no rate limits).

Transcript format stored in memory:

```json
{
  "language": "tl",
  "duration": 184.2,
  "words": [
    { "word": "So", "start": 0.42, "end": 0.61 },
    { "word": "ano", "start": 0.98, "end": 1.20 }
  ]
}
```

### Cut detection (rule-based)

- **Silence:** a gap between two words longer than the threshold (default 0.5 s) is cut, leaving 0.1 s padding on each side so speech doesn't sound clipped. ffmpeg `silencedetect` (noise −30 dB, duration 0.5 s) is a second check.
- **Fillers:** words matching the filler list are cut, unless removing them would leave a segment under 0.3 s.
- **Filler list (starter):** um, uh, erm, hmm, like (only when standalone), you know, ano, parang, kasi (only at sentence start), ah, eh.

### AI director (effects plan)

The server sends the transcript as numbered lines with timestamps, plus the chosen preset. The LLM returns JSON only.

System prompt (draft):

```text
You are a short-form video editor for TikTok and Reels.
Given a timestamped transcript and a style preset, return ONLY JSON
matching the schema. No prose, no markdown.
Rules:
- Add a zoom on the most important line every 4-8 seconds (Energetic)
  or every 12-20 seconds (Clean).
- Add an emoji only when a word clearly matches it.
- Add a text pop for the 1-3 strongest phrases, max 4 words each.
- Pick one music mood: upbeat, chill, dramatic, playful, none.
- Write a hook title of max 6 words for the first 3 seconds.
- Every time must be within the transcript's time range.
```

Effects plan schema:

```json
{
  "hook": "The secret nobody tells you",
  "music": { "mood": "upbeat", "volume": 0.15 },
  "effects": [
    { "type": "zoom", "start": 3.2, "end": 5.0, "scale": 1.25 },
    { "type": "emoji", "at": 8.4, "emoji": "💰", "sfx": "pop" },
    { "type": "text", "at": 12.1, "text": "THE SECRET?", "style": "bounce" },
    { "type": "sfx", "at": 20.5, "sound": "whoosh" }
  ],
  "highlights": [
    { "start": 30.0, "end": 72.5, "score": 8, "reason": "Strong hook and clear payoff" }
  ]
}
```

**Validation.** Parse with Zod. Drop effects with invalid times, unknown types or unknown sound names. Cap counts per minute by preset. If parsing fails twice, use the rule-based fallback: whoosh at every cut, zoom every 6 s on the longest sentence, no emoji.

**Long videos.** Transcripts over about 6,000 words are split into windows, planned separately, then merged.

## Motion and sound system

All motion and sound are rendered with ffmpeg.wasm in Phases 1–3; a Canvas + WebCodecs renderer is added in Phase 4 for effects ffmpeg can't do well.

### Rendering approach

| Renderer | Used for | Pros | Cons | Phase |
| --- | --- | --- | --- | --- |
| ffmpeg.wasm | Cuts, crop, zoom, captions, overlays, audio mix | One tool, proven filters, free | Slower than native, memory limits | 1–3 |
| Canvas + WebCodecs + mp4-muxer | Lottie, particles, custom motion graphics | Full animation freedom, faster encoding | More code, browser support varies | 4 |

### Visual effects (ffmpeg)

| Effect | ffmpeg technique |
| --- | --- |
| Trim and join | `trim` / `atrim` per segment, then `concat` |
| 9:16 crop | `crop=ih*9/16:ih` centered, then `scale=1080:1920` |
| Zoom punch-in | `scale` + `crop` with time expressions, enabled between start and end |
| Emoji and stickers | `overlay` of PNG with `enable='between(t,a,b)'` |
| Transitions | `xfade` (fade, slideleft, wipeleft, flash-style fadewhite) |
| Progress bar | `drawbox` with width tied to `t` |
| Captions and text pops | ASS subtitles burned with the `subtitles` filter |

### Captions with ASS

ASS (Advanced SubStation Alpha) subtitles handle all text animation in one file:

- Word highlighting with karaoke tags (`\k`) or per-word color changes.
- Pop-in with scale transforms (`\t(0,120,\fscx115\fscy115)`) then back to 100%.
- Fades with `\fad(80,80)`.
- Each preset maps to one ASS style (font, size, outline, shadow, colors, position).
- Bundle fonts (for example Montserrat, Poppins, both under the SIL Open Font License) and load them into ffmpeg.wasm's virtual file system.

### Audio mixing

| Step | ffmpeg filter |
| --- | --- |
| Join speech segments | `concat` (audio stream) with 10 ms fades at cuts to avoid clicks |
| Place SFX | `adelay` per sound to its time, then `amix` |
| Music bed | Loop with `aloop`, trim to video length, fade out last 1.5 s |
| Auto-ducking | `sidechaincompress` with speech as sidechain, so music drops while someone talks |
| Final loudness | `loudnorm` targeting about −14 LUFS (common for social platforms) |

### Effect density by preset

Caps prevent the edit from feeling chaotic. Values are per minute of final video.

| Preset | Zooms | Emoji | Text pops | SFX |
| --- | --- | --- | --- | --- |
| Energetic | 8–12 | 3–5 | 2–3 | 10–15 |
| Clean | 2–4 | 0 | 1 | 0–2 |
| Funny | 6–10 | 5–8 | 3–4 | 12–18 |
| Podcast | 0–2 | 0 | 0–1 | 0 |

## Asset library and licensing

Only assets that allow redistribution inside an app are bundled, and every file is listed in `CREDITS.md` with its source and license.

| Asset type | Source | License | Attribution needed |
| --- | --- | --- | --- |
| Sound effects | Kenney.nl audio packs | CC0 | No |
| Sound effects | Freesound.org (CC0 filter only) | CC0 | No |
| Sound effects | Self-made with jsfxr | Owned by you | No |
| Music | Freesound.org / Free Music Archive | CC0 or CC-BY | Yes for CC-BY |
| Emoji | Noto Emoji | Apache 2.0 | License notice |
| Emoji (alt) | Twemoji | CC-BY 4.0 | Yes |
| Fonts | Google Fonts (Montserrat, Poppins, Inter) | SIL Open Font License | License notice |
| Animations (Phase 4) | LottieFiles free animations | Lottie Simple License | Check per file |

**Starter SFX set (12 sounds):** whoosh (2 variants), pop, ding, click, swoosh-up, swoosh-down, boom, record scratch, camera shutter, typing, bell.

**Starter music set (8 tracks):** 2 upbeat, 2 chill, 2 playful, 1 dramatic, 1 lo-fi. Keep each under 1 MB (Opus) so the app loads fast.

**Rules**

- Never bundle sounds or music from sites whose terms only allow use in your own videos.
- Before adding a file, confirm the license on its page and save the page link in `CREDITS.md`.
- Show a "Credits" link in the app footer.

## Data model

Supabase stores only usage, accounts and feedback, never videos or transcripts, which keeps the database tiny and well inside the free tier.

**`profiles`** (optional sign-in, linked to Supabase Auth)

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid (PK) | Same as `auth.users.id` |
| display\_name | text | Optional |
| daily\_limit | int | Default 10 for signed-in users |
| created\_at | timestamptz | Default `now()` |

**`usage_logs`** (one row per processed video)

| Column | Type | Notes |
| --- | --- | --- |
| id | bigint (PK) | Identity |
| user\_id | uuid | Null for anonymous users |
| ip\_hash | text | SHA-256 of IP + salt, never the raw IP |
| duration\_sec | numeric | Length of uploaded video |
| preset | text | energetic, clean, funny, podcast |
| status | text | started, transcribed, planned, rendered, failed |
| error\_code | text | Null unless failed |
| created\_at | timestamptz | Default `now()` |

**`feedback`**

| Column | Type | Notes |
| --- | --- | --- |
| id | bigint (PK) | Identity |
| usage\_id | bigint (FK) | Links to `usage_logs.id` |
| rating | smallint | 1–5 |
| comment | text | Optional |
| created\_at | timestamptz | Default `now()` |

**Row Level Security**

- `profiles`: users read and update only their own row.
- `usage_logs` and `feedback`: inserts happen only from API routes using the service role key; no direct client access.

**Daily limit check:** count `usage_logs` rows for the `user_id` (or `ip_hash`) where `created_at` is within the last 24 hours. Anonymous limit: 3 videos per day.

## API reference

Four Next.js API routes keep API keys on the server; all video work stays in the browser.

| Method | Route | Purpose | Body limit |
| --- | --- | --- | --- |
| POST | `/api/session` | Check daily limit, create a usage log | JSON |
| POST | `/api/transcribe` | Send an audio chunk to Groq Whisper | under 4 MB |
| POST | `/api/plan` | Send transcript to the LLM, return effects plan | JSON |
| POST | `/api/feedback` | Save rating and comment | JSON |

### POST /api/session

```json
// request
{ "durationSec": 184.2, "preset": "energetic" }
// 200
{ "usageId": 1042, "remainingToday": 2 }
// 429
{ "error": "DAILY_LIMIT", "resetsAt": "2026-10-28T00:00:00Z" }
```

### POST /api/transcribe

`multipart/form-data` with `audio` (Opus file), `usageId`, `chunkIndex`, `offsetSec`, optional `language`.

```json
// 200
{ "chunkIndex": 0, "words": [{ "word": "So", "start": 0.42, "end": 0.61 }] }
```

Timestamps are returned already shifted by `offsetSec`.

### POST /api/plan

```json
// request
{ "usageId": 1042, "preset": "energetic", "transcript": { "words": [] } }
// 200: effects plan (see AI editing schema)
```

### POST /api/feedback

```json
{ "usageId": 1042, "rating": 5, "comment": "Captions look great" }
```

### Error codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| DAILY\_LIMIT | 429 | Daily video limit reached |
| RATE\_LIMITED | 429 | Groq free-tier limit hit; retry after the given seconds |
| FILE\_TOO\_LARGE | 413 | Audio chunk over 4 MB |
| BAD\_PLAN | 502 | LLM returned invalid JSON twice; client uses fallback |
| UPSTREAM\_ERROR | 502 | Groq or Supabase unavailable |

## Project structure

The code follows the same layered pattern as GCFast-MPTS (types → lib/services → hooks → components), with the media engine isolated in `lib/engine`.

```text
autocut/
├── app/
│   ├── page.tsx                 # Landing page
│   ├── edit/page.tsx            # Upload → style → processing → preview
│   ├── credits/page.tsx         # Asset credits
│   └── api/
│       ├── session/route.ts
│       ├── transcribe/route.ts
│       ├── plan/route.ts
│       └── feedback/route.ts
├── components/
│   ├── upload/                  # Dropzone, file checks
│   ├── style-picker/            # Presets, caption styles, music mood
│   ├── progress/                # Stage list, progress bar
│   └── preview/                 # Player, download, re-render
├── hooks/
│   ├── useFFmpeg.ts             # Load ffmpeg.wasm once
│   └── usePipeline.ts           # Runs all stages, exposes progress
├── lib/
│   ├── engine/
│   │   ├── audio.ts             # Extract + chunk audio
│   │   ├── cuts.ts              # Silence + filler detection
│   │   ├── edl.ts               # Build edit list, re-time effects
│   │   ├── ass.ts               # Generate ASS captions
│   │   ├── filtergraph.ts       # Build ffmpeg filter graph
│   │   └── render.ts            # Run ffmpeg.wasm
│   ├── ai/
│   │   ├── groq.ts              # Server-side Groq client
│   │   ├── prompts.ts           # Director prompts per preset
│   │   └── fallback.ts          # Rule-based effects plan
│   ├── presets.ts               # Preset configs and caps
│   ├── schemas.ts               # Zod schemas
│   └── supabase.ts
├── types/
│   └── index.ts                 # Word, Transcript, EffectsPlan, EDL
├── public/
│   ├── sfx/                     # .ogg sound effects
│   ├── music/                   # .ogg music tracks
│   ├── emoji/                   # PNG emoji
│   └── fonts/                   # .ttf caption fonts
├── CREDITS.md
├── next.config.js               # COOP/COEP headers
└── README.md
```

`lib/engine` has no React code, so it can be unit-tested on its own and reused later (for example, in a CLI or a worker).

## Setup and local development

You need Node.js 20+, a free Groq account and a free Supabase project.

1. Create the app:

   ```bash
   npx create-next-app@latest autocut --typescript --tailwind --app
   cd autocut
   npx shadcn@latest init
   npm install @ffmpeg/ffmpeg @ffmpeg/util @supabase/supabase-js groq-sdk zod
   ```
2. Add the COOP/COEP headers in `next.config.js` so ffmpeg.wasm can use multiple threads:

   ```js
   module.exports = {
     async headers() {
       return [{
         source: "/(.*)",
         headers: [
           { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
           { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
         ],
       }];
     },
   };
   ```
3. Copy the ffmpeg core files (`ffmpeg-core.js`, `ffmpeg-core.wasm`, and the worker for the multithreaded build) into `public/ffmpeg/` so they load from your own domain and pass the COEP check.
4. Create the Supabase tables from the Data model section and enable Row Level Security.
5. Add `.env.local`.
6. Run `npm run dev` and open `http://localhost:3000` in Chrome.

**Environment variables**

| Variable | Where used | Secret |
| --- | --- | --- |
| `GROQ_API_KEY` | API routes only | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Client and server | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client | No |
| `SUPABASE_SERVICE_ROLE_KEY` | API routes only | Yes |
| `IP_HASH_SALT` | API routes only | Yes |
| `ANON_DAILY_LIMIT` | API routes | No (default 3) |

Pin exact package versions in `package.json` once the project works, so updates don't break the ffmpeg setup.

## Deployment

The whole app deploys to Vercel's free Hobby plan with automatic deploys on push to `main`, the same flow you used for GCFast-MPTS.

1. Push the repo to GitHub.
2. Import it in Vercel and add the environment variables (secrets only in Production and Preview).
3. Confirm the COOP/COEP headers are live: in Chrome DevTools, `self.crossOriginIsolated` should return `true`.
4. Add a custom domain later if you buy one; the free `*.vercel.app` domain works for launch.
5. Turn on Vercel Analytics (free tier) for page views.

**Checks before each release**

- Process a 30 s, 3 min and 10 min test video end to end.
- Confirm no API key appears in the browser's network tab or JS bundle.
- Confirm the daily limit returns 429 on the fourth anonymous video.
- Check the credits page lists every bundled asset.

**Free-tier note:** Vercel Hobby is for non-commercial use. If AutoCut ever earns money, move to a paid plan or another host. Free-tier limits change, so check Vercel, Groq and Supabase pricing pages before launch.

## Limits, performance and free-tier protection

The binding limits are browser memory for rendering and Groq's free-tier rate limits for AI; both are handled with caps and fallbacks.

| Limit | Value | Reason |
| --- | --- | --- |
| Max video length | 15 min (MVP), 3 min with full effects | Browser memory and render time |
| Max file size | 500 MB | ffmpeg.wasm memory (about 2 GB ceiling) |
| Max audio chunk | under 4 MB | Vercel request body limit (4.5 MB) |
| Anonymous videos per day | 3 | Protects Groq free tier |
| Signed-in videos per day | 10 | Encourages sign-up without abuse |
| Output resolution | 1080×1920 | Standard for TikTok and Reels |

**Performance targets (desktop Chrome, mid-range laptop)**

- 1 min clip, Clean preset: under 1 min total processing.
- 1 min clip, Energetic preset: under 2 min.
- 10 min video, cuts and captions only: under 8 min.

Measure these in Phase 1 and adjust limits based on real results.

**Speed-ups**

- Use the multithreaded ffmpeg core (requires COOP/COEP).
- Use `-preset veryfast` (or `ultrafast` for previews) with libx264.
- Render a 480p preview first, then the full 1080p export only when the user clicks Download.
- Load ffmpeg.wasm once and reuse it.

**Protecting the free tier**

- Daily limits enforced server-side by `/api/session`, not the client.
- Retry Groq calls once on 429 using the `retry-after` header, then show a friendly "busy, try in a minute" message.
- Fall back to in-browser Whisper (Transformers.js) when Groq is rate limited.
- Fall back to the rule-based effects plan when the LLM is unavailable.

## Security and privacy

The main privacy promise is that videos never reach the server; the main security job is keeping API keys secret and stopping abuse of the free tier.

**Privacy**

- Video files are processed only in the browser and cleared from memory after download.
- Audio chunks are sent to Groq for transcription and not stored by AutoCut. Groq's own data policy applies; link it in the privacy page.
- Transcripts are kept only in browser memory for the session.
- IP addresses are stored only as salted SHA-256 hashes.
- Publish a short Privacy page and Terms page before public launch, written in plain English (and Filipino if possible).

**Security**

- `GROQ_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are used only in API routes, never prefixed with `NEXT_PUBLIC_`.
- Validate every request body with Zod; reject unknown fields.
- Check audio MIME type and size before forwarding to Groq.
- Treat LLM output as untrusted: validate the effects plan against the schema and whitelist effect types, sound names and emoji.
- Escape user-facing text (hook titles, text pops) before writing it into the ASS file, so special characters can't break the subtitle format.
- Row Level Security on every Supabase table.

**Content policy**

- Terms state that users must own or have rights to uploaded videos.
- Because videos never reach the server, AutoCut does not host or distribute user content.

## QA and testing plan

Testing covers the engine logic with unit tests, the full pipeline with a fixed set of sample videos, and real users through UAT before launch.

**Unit tests (Vitest)**

- `cuts.ts`: silence gaps, padding, filler matching, minimum segment length.
- `edl.ts`: re-timing effects after cuts, dropping effects inside removed segments.
- `ass.ts`: correct timing format, escaping special characters.
- `schemas.ts`: valid and invalid effects plans.
- `fallback.ts`: rule-based plan respects preset caps.

**Sample video set**

| ID | Video | Tests |
| --- | --- | --- |
| V1 | 30 s English talking head | Basic cuts and captions |
| V2 | 2 min Taglish vlog | Filipino fillers, language detection |
| V3 | 10 min podcast, two speakers | Chunking, long transcript, highlights |
| V4 | 1 min with background music already in it | Ducking, loudness |
| V5 | 20 s with no speech | No-speech error state |
| V6 | Landscape 4K 3 min | Memory, crop, scaling |
| V7 | Phone portrait 1 min | No crop needed |

**Test cases (sample)**

| ID | Case | Expected result |
| --- | --- | --- |
| TC-01 | Upload 16 min video | Blocked with length message |
| TC-02 | Upload V1 with Clean preset | Output has captions, fewer than 4 zooms per minute |
| TC-03 | Fourth anonymous video in a day | 429 with reset time shown |
| TC-04 | LLM returns invalid JSON | Fallback plan used, video still renders |
| TC-05 | Groq rate limited | Retry once, then browser Whisper or friendly message |
| TC-06 | V2 with filler removal on | "ano" and "parang" removed, speech still natural |
| TC-07 | Download, then upload a new video | Memory cleared, no crash |
| TC-08 | Safari and Firefox | Works or shows a clear "use Chrome" notice |

**UAT**

- Recruit 10–15 testers (creators, students, sellers).
- Give each a short form: rating 1–5, would they use it again, what felt wrong.
- Track bugs in GitHub Issues with labels: `bug`, `engine`, `ui`, `ai`, `perf`.

## Roadmap and build phases

AutoCut ships in four phases over about 10–14 weeks; Phase 1 goes public before any effects work begins.

&#91;embedded content: AutoCut roadmap · 4 phases, 3 gates\]

Each gate is a go/no-go check: if it fails, fix the current phase before starting the next one. Durations assume part-time work and can stretch.

**Phase 1 checklist**

- [ ] Create Next.js project, Tailwind, shadcn/ui
- [ ] Set COOP/COEP headers and self-host ffmpeg core files
- [ ] Upload page with length, size and format checks
- [ ] Load ffmpeg.wasm and extract compressed audio
- [ ] `/api/transcribe` with Groq Whisper and word timestamps
- [ ] Chunking for audio over 4 MB
- [ ] Silence detection and edit list (EDL)
- [ ] Trim and concat render, preview, download
- [ ] `/api/session` with Supabase usage logs and daily limit
- [ ] Deploy to Vercel and run the sample video set
- [ ] Recruit 10 testers

## Success metrics, launch plan and portfolio case study

The target for the first 60 days after launch is 100 real users and 300 processed videos, at ₱0 running cost.

**Metrics**

| Metric | Target (60 days) | Source |
| --- | --- | --- |
| Unique users | 100 | Vercel Analytics |
| Videos processed | 300 | `usage_logs` |
| Success rate (rendered / started) | 90% or higher | `usage_logs.status` |
| Average rating | 4.0 / 5 or higher | `feedback` |
| Returning users | 25% | `usage_logs` by user or IP hash |
| Monthly cost | ₱0 | Provider dashboards |

**Launch plan**

1. Soft launch to UAT testers; fix the top 5 issues.
2. Post before/after demos on your own TikTok and Facebook, edited with AutoCut.
3. Share in PH content creator groups, student org pages and online seller groups.
4. Post a build write-up on LinkedIn and dev.to explaining the free-tier architecture.
5. Submit to Product Hunt or similar directories once the Energetic preset is polished.

**Portfolio case study (for CV and LinkedIn)**

- Problem: short-form editing is slow, and free tools add watermarks.
- Solution: browser-based pipeline with an LLM "director" and rule-based fallbacks.
- Architecture: the diagram from this doc.
- Hard problems solved: Vercel body limit (audio chunking), Whisper dropping fillers, re-timing effects after cuts, audio ducking.
- Results: real numbers from the metrics table.

**Suggested CV entry**

> **AutoCut — AI Short-Form Video Auto-Editor** Stack: Next.js, TypeScript, ffmpeg.wasm, Groq (Whisper + Llama), Supabase, Vercel
>
> - Built a free, browser-based video editor that auto-cuts silences and filler words, adds animated captions, AI-planned motion effects, sound effects and ducked background music.
> - Designed an LLM "director" that returns a validated JSON effects plan, with a rule-based fallback for reliability.
> - Served \[X\] users and \[Y\] videos at ₱0 cost by running all video processing client-side.

## Risks and mitigations

The biggest risk is slow rendering on average laptops and phones; the plan keeps clips short and renders a preview first.

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Rendering too slow on low-end devices | Users leave before the result | 480p preview first, short-clip focus, clear progress UI |
| Browser runs out of memory | Crash, lost work | File size cap, free memory between stages, Chrome-first notice |
| Groq free-tier limits change or tighten | Transcription or planning fails | Daily caps, browser Whisper fallback, rule-based plan |
| LLM returns bad or chaotic plans | Ugly edits | Zod validation, per-preset caps, fallback plan |
| Whisper misses fillers or mis-times Taglish | Poor cuts | Filler prompt, silence detection backup, manual threshold slider |
| Asset license problems | Takedown or legal trouble | CC0-first library, `CREDITS.md` with source links |
| Vercel Hobby non-commercial rule | Hosting must change if monetized | Keep free; move host before adding payments |
| Scope creep | Never ships | Ship Phase 1 publicly before starting Phase 3 |
