"use client";

import { useRef, useState } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LIMITS } from "@/lib/limits";
import { checkVideo, VideoCheckError, type CheckedVideo } from "./checks";

export function Dropzone({ onAccepted }: { onAccepted: (v: CheckedVideo) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setChecking(true);
    try {
      onAccepted(await checkVideo(file));
    } catch (err) {
      setError(err instanceof VideoCheckError ? err.message : "This file couldn't be read.");
    } finally {
      setChecking(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload a video"
        onClick={() => input.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") input.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handle(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex min-h-[330px] cursor-pointer flex-col items-center justify-center gap-3 rounded-[12px] border border-dashed px-6 py-16 text-center transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          dragging ? "border-primary bg-primary/5" : "border-white/15 bg-[#111113] hover:border-white/25",
        )}
      >
        <span className="mb-2 grid size-11 place-items-center rounded-[9px] border border-white/10 bg-[#1a1a1d] text-primary">
          {checking ? <Loader2 className="size-5 animate-spin" /> : <ArrowUp className="size-5" />}
        </span>
        <p className="text-lg font-medium">{checking ? "Checking your video…" : "Drop a video here"}</p>
        <p className="text-sm text-[#a1a1a8]">
          or <span className="text-foreground underline underline-offset-4">browse files</span>
        </p>
        <p className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-1 font-mono text-[11px] text-faint">
          <span>max {LIMITS.maxVideoSeconds / 60} min</span>
          <span>max {LIMITS.maxFileBytes / 1024 / 1024} MB</span>
          <span>mp4 · mov · webm</span>
        </p>
        <input
          ref={input}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
          className="hidden"
          onChange={(e) => handle(e.target.files?.[0])}
        />
      </div>
      {error && (
        <p role="alert" className="rounded-[10px] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
