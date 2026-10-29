"use client";

import { useEffect, useState } from "react";
import { saveMedia, saveProject } from "@/lib/editor/autosave";
import { useEditorStore } from "@/lib/editor/store";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/** How long editing must pause before the project is written. */
const DEBOUNCE_MS = 500;

/** Saves the editor's project (debounced) and its media to IndexedDB. */
export function useAutosave(origin: string | null, source: File, music: File | null): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>("idle");

  useEffect(() => {
    let alive = true;
    saveMedia(source, music).catch((err) => {
      console.warn("[autosave] couldn't store the video in this browser", err);
      if (alive) setStatus("error");
    });
    return () => {
      alive = false;
    };
  }, [source, music]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    const write = () => {
      timer = undefined;
      const project = useEditorStore.getState().project;
      if (!project) return;
      setStatus("saving");
      saveProject(project, origin, source.name)
        .then(() => alive && setStatus((s) => (s === "error" ? s : "saved")))
        .catch((err) => {
          console.warn("[autosave] save failed", err);
          if (alive) setStatus("error");
        });
    };
    const unsubscribe = useEditorStore.subscribe((s, prev) => {
      if (s.project === prev.project || !s.project) return;
      clearTimeout(timer);
      timer = setTimeout(write, DEBOUNCE_MS);
    });
    // Don't drop a pending save when the editor or the tab closes.
    const flush = () => {
      if (!timer) return;
      clearTimeout(timer);
      write();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      alive = false;
      unsubscribe();
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [origin, source]);

  return status;
}
