"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { AlertTriangle, ArrowLeft, Check, Cloud, Download, Loader2, Monitor, Redo2, Sparkles, Undo2, X } from "lucide-react";
import type { PipelineResult } from "@/hooks/usePipeline";
import { useAutosave, type SaveStatus } from "@/hooks/useAutosave";
import { useProjectExport } from "@/hooks/useProjectExport";
import { peekAutosave } from "@/lib/editor/autosave";
import { projectFromComposition } from "@/lib/editor/convert";
import type { Project } from "@/lib/editor/project";
import { editorHistory, useEditorStore } from "@/lib/editor/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/site/chrome";
import { Progress } from "@/components/ui/progress";
import { PreviewPlayer } from "./PreviewPlayer";
import { Sidebar } from "./Sidebar";
import type { Tab } from "./AssetPanels";
import { Timeline } from "./Timeline";

/** "Re-run AI edit": runs the AI director again on the same transcript. */
export interface StudioRerun {
  run: () => void;
  running: boolean;
  /** 0-100. */
  progress: number;
  label: string;
  error: string | null;
}

/**
 * Lightweight manual editor, opened with the AI's edit already loaded (or a
 * project restored from this browser's autosave).
 */
export function Studio({
  result,
  restored,
  source,
  customMusic,
  onBack,
  backLabel = "Back to auto edit",
  rerun,
}: {
  result: PipelineResult | null;
  restored?: { project: Project; origin: string | null };
  source: File;
  customMusic: File | null;
  onBack: () => void;
  backLabel?: string;
  /** Not available for a restored project (the transcript isn't kept). */
  rerun?: StudioRerun;
}) {
  const project = useEditorStore((s) => s.project);
  const canUndo = useStore(useEditorStore.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useEditorStore.temporal, (s) => s.futureStates.length > 0);
  const narrow = useNarrowScreen();
  const [tab, setTab] = useState<Tab>("text");
  // Music the user uploads inside the editor replaces the one from the AI edit.
  const [music, setMusic] = useState<File | null>(customMusic);

  const origin = result?.previewUrl ?? restored?.origin ?? null;
  const saveStatus = useAutosave(origin, source, music);
  const exporter = useProjectExport();
  const loaded = useRef(false);

  // Start from the AI's edit, or from where the user left off with it. A new
  // AI edit (Re-run) replaces the project as one undoable step.
  useEffect(() => {
    if (!result) {
      if (restored) useEditorStore.getState().load(restored.project);
      return;
    }
    let alive = true;
    const fresh = () => projectFromComposition(result.comp, result.info, result.settings, result.musicTrack);
    if (loaded.current) {
      useEditorStore.getState().replace(fresh());
      return;
    }
    void peekAutosave().then((saved) => {
      if (!alive) return;
      loaded.current = true;
      const resume = saved && saved.origin === result.previewUrl && saved.sourceName === source.name;
      useEditorStore.getState().load(resume ? saved.project : fresh());
    });
    return () => {
      alive = false;
    };
    // `restored` is only read on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, source]);

  // Shortcuts: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) editorHistory.redo();
        else editorHistory.undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const exporting = exporter.state.status === "running";

  if (!project) return null;

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center gap-2 border-b border-white/[.06] px-4 py-2.5">
        <Logo />
        <div className="mx-2 h-5 w-px bg-white/10" />
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft /> {backLabel}
        </Button>
        <div className="mx-2 h-5 w-px bg-border" />
        <Button variant="ghost" size="icon-sm" disabled={!canUndo} onClick={editorHistory.undo} aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)">
          <Undo2 />
        </Button>
        <Button variant="ghost" size="icon-sm" disabled={!canRedo} onClick={editorHistory.redo} aria-label="Redo (Ctrl+Shift+Z)" title="Redo (Ctrl+Shift+Z)">
          <Redo2 />
        </Button>
        <div className="flex-1" />
        <SaveIndicator status={saveStatus} />
        <Button
          variant="outline"
          size="sm"
          disabled={!rerun || rerun.running || exporting}
          onClick={rerun?.run}
          title={rerun ? "Ask the AI to edit again. Undo (Ctrl+Z) brings your manual edit back." : "Upload the video again to re-run the AI edit"}
        >
          {rerun?.running ? <Loader2 className="animate-spin" /> : <Sparkles />} Re-run AI edit
        </Button>
        <Button
          size="sm"
          disabled={exporting || !!rerun?.running}
          onClick={() => {
            const p = useEditorStore.getState().project;
            if (p) void exporter.exportProject(p, source, music);
          }}
        >
          {exporting ? <Loader2 className="animate-spin" /> : <Download />} Export
        </Button>
      </header>

      {exporter.state.status === "running" && (
        <StatusBar>
          <span className="shrink-0">
            {exporter.state.label}… {Math.round(exporter.state.progress * 100)}%
          </span>
          <Progress value={Math.round(exporter.state.progress * 100)} className="flex-1" />
          <span className="shrink-0 text-xs text-muted-foreground">Keep this tab open. Rendering runs in your browser.</span>
        </StatusBar>
      )}
      {exporter.state.status === "done" && (
        <StatusBar onClose={exporter.dismiss}>
          <Check className="size-4 text-primary" /> Your video was downloaded.
        </StatusBar>
      )}
      {exporter.state.status === "error" && (
        <StatusBar tone="error" onClose={exporter.dismiss}>
          <AlertTriangle className="size-4" /> Export failed: {exporter.state.message}
        </StatusBar>
      )}
      {rerun?.running && (
        <StatusBar>
          <span className="shrink-0">
            AI re-editing: {rerun.label}… {rerun.progress}%
          </span>
          <Progress value={rerun.progress} className="flex-1" />
        </StatusBar>
      )}
      {rerun?.error && !rerun.running && (
        <StatusBar tone="error">
          <AlertTriangle className="size-4" /> Re-run failed: {rerun.error}
        </StatusBar>
      )}

      {narrow && (
        <p className="flex items-center gap-2 border-b bg-primary/5 px-4 py-2 text-sm">
          <Monitor className="size-4 text-primary" /> The editor works best on a desktop screen (1024 px or wider).
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        <Sidebar tab={tab} onTab={setTab} onCustomMusic={setMusic} />
        <main className="min-w-0 flex-1 p-4">
          <PreviewPlayer source={source} customMusic={music} />
        </main>
      </div>

      <footer className="h-[310px] shrink-0 border-t">
        <Timeline source={source} customMusic={music} />
      </footer>
    </div>
  );
}

function StatusBar({
  children,
  tone,
  onClose,
}: {
  children: React.ReactNode;
  tone?: "error";
  onClose?: () => void;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-3 border-b px-4 py-2 text-sm",
        tone === "error" ? "bg-destructive/10 text-destructive" : "bg-primary/5",
      )}
    >
      {children}
      {onClose && (
        <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={onClose} aria-label="Dismiss">
          <X />
        </Button>
      )}
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  return (
    <span
      className={cn("mr-1 flex items-center gap-1 text-xs", status === "error" ? "text-destructive" : "text-muted-foreground")}
      title={status === "error" ? "This browser couldn't store the edit (it may be out of space)." : "Your edit is saved in this browser."}
    >
      {status === "error" ? <AlertTriangle className="size-3.5" /> : <Cloud className="size-3.5" />}
      {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Not saved"}
    </span>
  );
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

function useNarrowScreen() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return narrow;
}

export { isTyping };
