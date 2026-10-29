import { create } from "zustand";
import { temporal } from "zundo";
import {
  deleteItem,
  duplicateItem,
  projectDuration,
  splitClip,
  splitItem,
} from "./ops";
import type { ItemRef, Project } from "./project";
import { addAsset, type Asset } from "./add";

/**
 * Editor state. Only `project` is part of undo/redo (100 steps); the playhead,
 * selection and timeline zoom are UI state.
 */
export interface EditorState {
  project: Project | null;
  selection: ItemRef | null;
  /** Output time (seconds). */
  playhead: number;
  /** Timeline zoom: pixels per second. */
  pxPerSecond: number;

  /** Opens a project and clears history (not undoable). */
  load: (project: Project) => void;
  /** Replaces the whole project as one undoable step (e.g. "Re-run AI edit"). */
  replace: (project: Project) => void;
  /** Applies an edit function as one undoable step (unless a gesture is running). */
  apply: (edit: (p: Project) => Project) => void;
  select: (ref: ItemRef | null) => void;
  setPlayhead: (t: number) => void;
  setZoom: (pxPerSecond: number) => void;

  /** Adds an asset (at the playhead unless a time is given) and selects it. */
  add: (asset: Asset, at?: number) => void;

  /** Split the selected overlay at the playhead, or the clip under it. */
  splitAtPlayhead: () => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;

  /** Start/finish a drag: everything in between becomes a single undo step. */
  beginGesture: () => void;
  endGesture: () => void;
}

export const MIN_ZOOM = 10;
export const MAX_ZOOM = 400;

let gestureStart: Project | null = null;

export const useEditorStore = create<EditorState>()(
  temporal(
    (set, get) => ({
      project: null,
      selection: null,
      playhead: 0,
      pxPerSecond: 60,

      load: (project) => {
        set({ project, selection: null, playhead: 0 });
        useEditorStore.temporal.getState().clear();
      },
      replace: (project) => set({ project, selection: null }),
      apply: (edit) => {
        const p = get().project;
        if (!p) return;
        const next = edit(p);
        if (next !== p) {
          set({ project: next, playhead: Math.min(get().playhead, projectDuration(next)) });
        }
      },
      select: (selection) => set({ selection }),
      setPlayhead: (t) => {
        const p = get().project;
        const D = p ? projectDuration(p) : 0;
        set({ playhead: Math.max(0, Math.min(D, t)) });
      },
      setZoom: (px) => set({ pxPerSecond: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, px)) }),

      add: (asset, at) => {
        const { project, playhead } = get();
        if (!project) return;
        const { project: next, ref } = addAsset(project, asset, at ?? playhead);
        set({ project: next, selection: ref });
      },

      splitAtPlayhead: () => {
        const { selection, playhead, apply } = get();
        if (selection && selection.track !== "clips") {
          apply((p) => splitItem(p, selection, playhead));
        } else {
          apply((p) => splitClip(p, playhead));
        }
      },
      deleteSelected: () => {
        const { selection, apply } = get();
        if (!selection) return;
        apply((p) => deleteItem(p, selection));
        set({ selection: null });
      },
      duplicateSelected: () => {
        const { selection, project } = get();
        if (!selection || !project) return;
        const { project: next, ref } = duplicateItem(project, selection);
        if (next !== project) set({ project: next, selection: ref });
      },

      beginGesture: () => {
        gestureStart = get().project;
        useEditorStore.temporal.getState().pause();
      },
      endGesture: () => {
        const temporalState = useEditorStore.temporal.getState();
        const start = gestureStart;
        gestureStart = null;
        const final = get().project;
        if (!start || final === start) {
          temporalState.resume();
          return;
        }
        // Rewind silently, then record the whole gesture as one change.
        set({ project: start });
        temporalState.resume();
        set({ project: final });
      },
    }),
    {
      limit: 100,
      partialize: (state) => ({ project: state.project }),
      // Playhead, selection and zoom changes don't create history entries.
      equality: (a, b) => a.project === b.project,
    },
  ),
);

/** Undo/redo helpers (also used by the keyboard shortcuts). */
export const editorHistory = {
  undo: () => useEditorStore.temporal.getState().undo(),
  redo: () => useEditorStore.temporal.getState().redo(),
  canUndo: () => useEditorStore.temporal.getState().pastStates.length > 0,
  canRedo: () => useEditorStore.temporal.getState().futureStates.length > 0,
};
