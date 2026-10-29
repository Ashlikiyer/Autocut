# Credits

Every asset bundled with AutoCut is listed here with its source and license.
Before adding a file, confirm the license on its source page and add the link below.
Keep this file in sync with `app/credits/page.tsx`.

## Software

| Name | License | Source |
| --- | --- | --- |
| FFmpeg / ffmpeg.wasm (`public/ffmpeg`, copied at build time) | LGPL/GPL (core), MIT (wrapper) | https://github.com/ffmpegwasm/ffmpeg.wasm |
| shadcn/ui, Base UI | MIT | https://ui.shadcn.com |
| Lucide icons | ISC | https://lucide.dev |

## Fonts

| Name | License | Source |
| --- | --- | --- |
| Geist (UI, via next/font) | SIL Open Font License 1.1 | https://vercel.com/font |
| Poppins (captions, `public/fonts/Poppins-*.ttf`) | SIL Open Font License 1.1 (`public/fonts/OFL-Poppins.txt`) | https://github.com/google/fonts/tree/main/ofl/poppins |
| Bangers (Funny captions, `public/fonts/Bangers-Regular.ttf`) | SIL Open Font License 1.1 (`public/fonts/OFL-Bangers.txt`) | https://github.com/google/fonts/tree/main/ofl/bangers |
| Anton (₱ fallback, `public/fonts/Anton-Regular.ttf`) | SIL Open Font License 1.1 (`public/fonts/OFL-Anton.txt`) | https://github.com/google/fonts/tree/main/ofl/anton |

## Sound effects

All 12 files in `public/sfx/` (whoosh, whoosh2, pop, ding, click, swoosh-up, swoosh-down, boom, scratch, shutter, typing, bell) are synthesized by AutoCut with `scripts/make-sfx.mjs`. Owned by the project, no attribution needed.

## Music

All tracks in `public/music/` are synthesized by AutoCut with `scripts/make-music.mjs` and listed in `public/music/manifest.json`. Owned by the project, no attribution needed.

To add a third-party track: confirm it is CC0 or CC-BY on its source page, add it to `public/music/`, list it in `manifest.json`, and add a row here with the source link (and attribution for CC-BY).

Music users upload themselves is never stored or redistributed by AutoCut.

## Emoji

Emoji are drawn at render time with the viewer's own system emoji font (no emoji images are bundled).
