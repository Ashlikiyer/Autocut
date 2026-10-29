import { del, get, set } from "idb-keyval";
import type { Project } from "./project";

/**
 * Keeps the editor's project and its source video in this browser's
 * IndexedDB, so a reload or a closed tab doesn't lose the edit. Nothing here
 * leaves the device.
 *
 * The project (small, saved often) and the media (large, saved once per file)
 * live under separate keys so each project save doesn't copy the video again.
 */

const PROJECT_KEY = "autocut:editor:project";
const SOURCE_KEY = "autocut:editor:source";
const MUSIC_KEY = "autocut:editor:music";

export interface SavedProject {
  version: 1;
  project: Project;
  /** Which auto edit the project started from, so reopening the editor resumes it. */
  origin: string | null;
  sourceName: string;
  savedAt: number;
}

export interface Autosave extends SavedProject {
  source: File;
  music: File | null;
}

/** True for a saved record this version of the editor can open. */
export function isSavedProject(v: unknown): v is SavedProject {
  if (!v || typeof v !== "object") return false;
  const r = v as Partial<SavedProject>;
  const p = r.project as Partial<Project> | undefined;
  return (
    r.version === 1 &&
    typeof r.sourceName === "string" &&
    typeof r.savedAt === "number" &&
    !!p &&
    p.version === 1 &&
    Array.isArray(p.clips) &&
    p.clips.length > 0 &&
    !!p.info &&
    !!p.settings
  );
}

export async function saveProject(project: Project, origin: string | null, sourceName: string) {
  const record: SavedProject = { version: 1, project, origin, sourceName, savedAt: Date.now() };
  await set(PROJECT_KEY, record);
}

// The media files last written, so they're only stored again when they change.
let savedSource: File | null = null;
let savedMusic: File | null | undefined;

export async function saveMedia(source: File, music: File | null) {
  if (savedSource !== source) {
    await set(SOURCE_KEY, source);
    savedSource = source;
  }
  if (savedMusic !== music) {
    if (music) await set(MUSIC_KEY, music);
    else await del(MUSIC_KEY);
    savedMusic = music;
  }
}

/** The saved project without its media (cheap; for the "resume" prompt). */
export async function peekAutosave(): Promise<SavedProject | null> {
  try {
    const record = await get(PROJECT_KEY);
    return isSavedProject(record) ? record : null;
  } catch {
    return null;
  }
}

export async function loadAutosave(): Promise<Autosave | null> {
  const record = await peekAutosave();
  if (!record) return null;
  try {
    const [source, music] = await Promise.all([get(SOURCE_KEY), get(MUSIC_KEY)]);
    if (!(source instanceof Blob)) return null;
    const file = source instanceof File ? source : new File([source], record.sourceName);
    savedSource = file;
    savedMusic = music instanceof File ? music : null;
    return { ...record, source: file, music: savedMusic };
  } catch {
    return null;
  }
}

export async function clearAutosave() {
  savedSource = null;
  savedMusic = undefined;
  await Promise.all([del(PROJECT_KEY), del(SOURCE_KEY), del(MUSIC_KEY)]).catch(() => {});
}
