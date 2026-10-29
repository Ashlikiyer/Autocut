"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { EditSettings } from "@/types";
import { useFFmpeg } from "@/hooks/useFFmpeg";
import { STAGES, usePipeline } from "@/hooks/usePipeline";
import {
  clearAutosave,
  loadAutosave,
  peekAutosave,
  type Autosave,
  type SavedProject,
} from "@/lib/editor/autosave";
import { Button } from "@/components/ui/button";
import { AppHeader, type FlowStep } from "@/components/flow/AppHeader";
import { Panel, ScreenTitle, StepLabel } from "@/components/flow/ui";
import { Dropzone } from "@/components/upload/Dropzone";
import { FileCard } from "@/components/upload/FileCard";
import type { CheckedVideo } from "@/components/upload/checks";
import { SettingsForm } from "@/components/style-picker/SettingsForm";
import { StageList } from "@/components/progress/StageList";
import { PreviewPanel } from "@/components/preview/PreviewPanel";
import { Studio } from "@/components/studio/Studio";
import { BrowserNotice } from "./BrowserNotice";

export function Editor() {
  // Start downloading ffmpeg.wasm while the user picks a file.
  useFFmpeg();
  const pipeline = usePipeline();
  const [video, setVideo] = useState<CheckedVideo | null>(null);
  /** The picked video was confirmed with "Continue". */
  const [confirmed, setConfirmed] = useState(false);
  const [settings, setSettings] = useState<EditSettings | null>(null);
  const [musicFile, setMusicFile] = useState<File | null>(null);
  /** Manual editor open on top of the AI's edit. */
  const [editing, setEditing] = useState(false);
  /** An edit saved in this browser, offered on the upload screen. */
  const [saved, setSaved] = useState<SavedProject | null>(null);
  /** The saved edit, reopened in the editor. */
  const [resumed, setResumed] = useState<Autosave | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);

  const refreshSaved = () => void peekAutosave().then(setSaved);
  useEffect(refreshSaved, []);

  const resume = async () => {
    setResumeError(null);
    const a = await loadAutosave();
    if (a) setResumed(a);
    else setResumeError("The saved edit couldn't be opened. Upload the video again.");
  };

  const start = (s: EditSettings, music: File | null) => {
    if (!video) return;
    setSettings(s);
    setMusicFile(music);
    pipeline.process(video.file, video.duration, s, music);
  };

  const reset = () => {
    setVideo(null);
    setConfirmed(false);
    setSettings(null);
    setMusicFile(null);
    setEditing(false);
    pipeline.reset();
    refreshSaved();
  };

  const { phase } = pipeline;
  const step: FlowStep | "error" =
    phase === "idle"
      ? video && confirmed
        ? "style"
        : "upload"
      : phase === "processing"
        ? "processing"
        : phase === "error"
          ? "error"
          : "preview";

  if (resumed) {
    return (
      <Studio
        result={null}
        restored={{ project: resumed.project, origin: resumed.origin }}
        source={resumed.source}
        customMusic={resumed.music}
        backLabel="Close editor"
        onBack={() => {
          setResumed(null);
          refreshSaved();
        }}
      />
    );
  }

  // The editor stays open while "Re-run AI edit" works (and if it fails).
  if (editing && phase !== "idle" && pipeline.result && video) {
    return (
      <Studio
        result={pipeline.result}
        source={video.file}
        customMusic={musicFile}
        onBack={() => setEditing(false)}
        rerun={{
          run: () => pipeline.rerender({}, undefined, { replan: true }),
          running: phase === "processing",
          progress: pipeline.progress,
          label: STAGES.find((x) => x.id === pipeline.stage)?.label ?? "Working",
          error: phase === "error" ? (pipeline.error?.message ?? "Something went wrong.") : null,
        }}
      />
    );
  }

  const remaining = pipeline.result && pipeline.result.usageId > 0 ? pipeline.result.remainingToday : null;

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader step={step === "error" ? "processing" : step} remaining={remaining} />

      <div className="mx-auto w-full max-w-[1200px] px-4 pt-14 pb-24 sm:px-8">
        <div className="mx-auto mb-8 max-w-[756px] empty:hidden">
          <BrowserNotice />
        </div>

        {step === "upload" && (
          <div className="mx-auto flex max-w-[756px] flex-col gap-8">
            <ScreenTitle step={1} title="Upload your video" subtitle="It stays on your device. Desktop Chrome works best." />

            {saved && !video && (
              <Panel className="flex flex-wrap items-center gap-4 p-4">
                <span className="grid size-9 place-items-center rounded-md border border-white/10 bg-[#1a1a1d] font-mono text-xs text-primary">↺</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">Resume your last edit</span>
                  <span className="block truncate font-mono text-[11.5px] text-faint">
                    {saved.sourceName} · saved {new Date(saved.savedAt).toLocaleString()}
                  </span>
                  {resumeError && <span className="mt-1 block text-sm text-destructive">{resumeError}</span>}
                </span>
                <Button variant="light" size="lg" onClick={resume}>
                  Resume
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={() => {
                    void clearAutosave();
                    setSaved(null);
                  }}
                >
                  Discard
                </Button>
              </Panel>
            )}

            {video ? <FileCard video={video} onReplace={() => setVideo(null)} /> : <Dropzone onAccepted={setVideo} />}

            <div className="flex items-center justify-between gap-4 border-t border-white/[.06] pt-6">
              <span className="font-mono text-[11px] text-faint">no account needed · 3 free / day</span>
              <Button variant={video ? "light" : "secondary"} size="xl" disabled={!video} onClick={() => setConfirmed(true)}>
                Continue →
              </Button>
            </div>
          </div>
        )}

        {step === "style" && video && (
          <SettingsForm
            fileName={video.file.name}
            onSubmit={start}
            onBack={() => setConfirmed(false)}
            isPortrait={video.height > video.width}
          />
        )}

        {step === "processing" && (
          <div className="mx-auto max-w-[576px]">
            <StageList
              stage={pipeline.stage}
              progress={pipeline.progress}
              stageProgress={pipeline.stageProgress}
              stageStartedAt={pipeline.stageStartedAt}
              footer={
                <div className="mt-8 flex items-center justify-between gap-4">
                  <span className="font-mono text-[11px] text-faint">↑ sent: audio only · video stays local</span>
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={() => {
                      pipeline.cancel();
                      setSettings(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              }
            />
          </div>
        )}

        {step === "error" && pipeline.error && (
          <div className="mx-auto flex max-w-[576px] flex-col gap-6">
            <StepLabel n={3} extra="stopped" />
            <Panel className="flex flex-col gap-3 border-destructive/30 p-6">
              <p className="flex items-center gap-2 text-lg font-medium">
                <AlertTriangle className="size-5 text-destructive" /> {pipeline.error.title}
              </p>
              <p className="text-[15px] leading-relaxed text-[#a1a1a8]">{pipeline.error.message}</p>
            </Panel>
            <div className="flex flex-wrap gap-2">
              {pipeline.error.canContinueWithoutSpeech && (
                <Button variant="light" size="xl" onClick={pipeline.continueWithoutSpeech}>
                  Cut silent parts anyway
                </Button>
              )}
              {video && settings && !pipeline.error.canContinueWithoutSpeech && (
                <Button variant="light" size="xl" onClick={() => start(settings, musicFile)}>
                  Try again
                </Button>
              )}
              <Button variant="secondary" size="xl" className="border-white/10" onClick={reset}>
                Upload a different video
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && pipeline.result && settings && (
          <>
            {pipeline.error && (
              <p role="alert" className="mb-6 flex items-center gap-2 rounded-[10px] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertTriangle className="size-4" /> {pipeline.error.title}: {pipeline.error.message}
              </p>
            )}
            <PreviewPanel
              onOpenEditor={() => setEditing(true)}
              key={pipeline.result.previewUrl}
              result={pipeline.result}
              musicFile={musicFile}
              exporting={phase === "exporting"}
              exportProgress={pipeline.exportProgress}
              onRerender={(changes, music) => {
                setSettings({ ...settings, ...changes });
                setMusicFile(music);
                pipeline.rerender(changes, music);
              }}
              onRedoWithAi={() => {
                setSettings({ ...settings, auto: true });
                pipeline.rerender({ auto: true }, undefined, { replan: true });
              }}
              onExport={pipeline.exportVideo}
              onReset={reset}
            />
          </>
        )}
      </div>
    </div>
  );
}
