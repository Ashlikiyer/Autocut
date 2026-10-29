import type { FFmpeg } from "@ffmpeg/ffmpeg";
import type { MusicMood, SfxName } from "@/types";
import { FONT_FILES } from "@/lib/presets";
import type { Composition } from "./compose";
import { drawCard } from "./cards";
import type { CardOverlay } from "@/lib/overlay-client";
import type { RenderAssets } from "./filtergraph";

/**
 * Browser-only: loads the files a composition needs into ffmpeg's virtual FS.
 * Fonts and SFX are written once per ffmpeg instance and reused.
 */

const FONTS_DIR = "/fonts";
const loaded = new WeakMap<FFmpeg, Set<string>>();

function cache(ffmpeg: FFmpeg) {
  let set = loaded.get(ffmpeg);
  if (!set) loaded.set(ffmpeg, (set = new Set()));
  return set;
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't load ${url} (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

async function writeOnce(ffmpeg: FFmpeg, path: string, url: string) {
  const done = cache(ffmpeg);
  if (done.has(path)) return;
  await ffmpeg.writeFile(path, await fetchBytes(url));
  done.add(path);
}

async function loadFonts(ffmpeg: FFmpeg) {
  if (!cache(ffmpeg).has(FONTS_DIR)) {
    try {
      await ffmpeg.createDir(FONTS_DIR);
    } catch {
      // already exists
    }
    cache(ffmpeg).add(FONTS_DIR);
  }
  await Promise.all(
    FONT_FILES.map((f) => writeOnce(ffmpeg, `${FONTS_DIR}/${f}`, `/fonts/${f}`)),
  );
}

async function loadSfx(ffmpeg: FFmpeg, names: SfxName[]) {
  const paths: Partial<Record<SfxName, string>> = {};
  await Promise.all(
    [...new Set(names)].map(async (name) => {
      const path = `/sfx_${name}.ogg`;
      await writeOnce(ffmpeg, path, `/sfx/${name}.ogg`);
      paths[name] = path;
    }),
  );
  return paths;
}

interface MusicTrack {
  file: string;
  mood: MusicMood;
  title: string;
  credit: string;
}

let manifest: Promise<MusicTrack[]> | null = null;
function musicManifest() {
  manifest ??= fetch("/music/manifest.json")
    .then((r) => (r.ok ? r.json() : { tracks: [] }))
    .then((j: { tracks?: MusicTrack[] }) => j.tracks ?? [])
    .catch(() => []);
  return manifest;
}

/** All bundled music tracks (from public/music/manifest.json). */
export function musicTracks(): Promise<MusicTrack[]> {
  return musicManifest();
}

/** Picks a bundled track for a mood; null if none is bundled. */
export async function pickTrack(mood: MusicMood): Promise<MusicTrack | null> {
  const tracks = (await musicManifest()).filter((t) => t.mood === mood);
  if (!tracks.length) return null;
  return tracks[Math.floor(Math.random() * tracks.length)];
}

/** Draws an emoji with the system emoji font and returns PNG bytes. */
async function emojiPng(emoji: string, px = 160): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(px, px);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.clearRect(0, 0, px, px);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.round(px * 0.8)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.fillText(emoji, px / 2, px / 2 + px * 0.04);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Writes everything the composition needs and returns their paths.
 * `customMusic` is the user's own track when they chose "Upload my own".
 */
export async function prepareAssets(
  ffmpeg: FFmpeg,
  comp: Composition,
  customMusic: File | null,
  cardOverlay: CardOverlay | null = null,
): Promise<{
  assets: Omit<RenderAssets, "assPath">;
  musicTitle: string | null;
  /** The bundled track used (so the editor keeps the same song). */
  musicTrack: { file: string; title: string } | null;
}> {
  const hasText = comp.words.length > 0 || Boolean(comp.hook) || comp.texts.length > 0;
  if (hasText) await loadFonts(ffmpeg);

  const sfxPaths = await loadSfx(ffmpeg, comp.sfx.map((s) => s.sound));

  const emojiPaths: string[] = [];
  for (const [i, e] of comp.emojis.entries()) {
    const path = `/emoji_${i}.png`;
    try {
      await ffmpeg.writeFile(path, await emojiPng(e.emoji));
      emojiPaths.push(path);
    } catch {
      emojiPaths.push("");
    }
  }

  // HyperFrames overlay when we have one; otherwise cards drawn in the browser.
  let overlayAsset: RenderAssets["cardOverlay"];
  if (cardOverlay && cardOverlay.segments.length === comp.cards.length) {
    // writeFile transfers (detaches) the buffer it's given, and this overlay is
    // cached for re-renders and the download, so hand ffmpeg a copy.
    await ffmpeg.writeFile("/cards_overlay.webm", cardOverlay.webm.slice());
    overlayAsset = { path: "/cards_overlay.webm", segments: cardOverlay.segments };
  }
  const cardPaths: string[] = [];
  for (const [i, c] of (overlayAsset ? [] : comp.cards).entries()) {
    const path = `/card_${i}.png`;
    try {
      await ffmpeg.writeFile(path, await drawCard(c, comp.theme));
      cardPaths.push(path);
    } catch (err) {
      console.warn("[assets] card failed", err);
      cardPaths.push("");
    }
  }

  let musicPath: string | undefined;
  let musicTitle: string | null = null;
  let musicTrack: { file: string; title: string } | null = null;
  if (comp.music?.source === "custom" && customMusic) {
    const ext = customMusic.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "audio";
    musicPath = `/music_custom.${ext}`;
    await ffmpeg.writeFile(musicPath, new Uint8Array(await customMusic.arrayBuffer()));
    musicTitle = customMusic.name;
  } else if (comp.music?.source === "bundled") {
    // Keep a specific track when one was chosen (e.g. in the editor).
    const chosen = comp.music.file;
    const track = chosen
      ? ((await musicTracks()).find((t) => t.file === chosen) ?? null)
      : await pickTrack(comp.music.mood);
    if (track) {
      musicPath = `/music_${track.file}`;
      await writeOnce(ffmpeg, musicPath, `/music/${track.file}`);
      musicTitle = track.title;
      musicTrack = { file: track.file, title: track.title };
    }
  }

  return {
    assets: {
      fontsDir: hasText ? FONTS_DIR : undefined,
      emojiPaths,
      cardPaths,
      cardOverlay: overlayAsset,
      sfxPaths,
      musicPath,
    },
    musicTitle,
    musicTrack,
  };
}
