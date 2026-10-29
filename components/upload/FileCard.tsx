"use client";

import { useEffect, useState } from "react";
import { LIMITS } from "@/lib/limits";
import { formatDuration, type CheckedVideo } from "./checks";

/** The chosen video: thumbnail, name, size and the checks it passed. */
export function FileCard({ video, onReplace }: { video: CheckedVideo; onReplace: () => void }) {
  const thumb = useThumbnail(video.file);
  const mb = video.file.size / 1024 / 1024;
  const ext = video.file.name.split(".").pop()?.toLowerCase() ?? "video";
  const checks: [string, string][] = [
    ["length", video.duration > 0 ? `${formatDuration(video.duration)} / ${formatDuration(LIMITS.maxVideoSeconds)}` : "checked when it loads"],
    ["size", `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} / ${LIMITS.maxFileBytes / 1024 / 1024} MB`],
    ["format", ext],
  ];
  return (
    <div className="grid gap-5 rounded-[12px] border border-white/[.08] bg-[#111113] p-5 sm:grid-cols-[180px_1fr]">
      <div className="relative aspect-video overflow-hidden rounded-md bg-[repeating-linear-gradient(45deg,#18181b,#18181b_6px,#1c1c1f_6px,#1c1c1f_12px)]">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local blob URL
          <img src={thumb} alt="" className="size-full object-cover" />
        ) : (
          <span className="absolute inset-0 grid place-items-center font-mono text-[10px] text-ghost">thumbnail</span>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-base font-medium">{video.file.name}</p>
            <p className="mt-1 font-mono text-[11.5px] text-faint">
              {video.width > 0 ? `${video.width}×${video.height}` : "size checked on load"}
              {video.height > video.width ? " · vertical" : video.width > 0 ? " · landscape" : ""}
            </p>
          </div>
          <button type="button" onClick={onReplace} className="shrink-0 text-sm text-[#a1a1a8] hover:text-foreground">
            Replace
          </button>
        </div>
        <dl className="m-0 flex flex-col gap-1.5 font-mono text-[12px]">
          {checks.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="flex items-center gap-2 text-subtle">
                <span className="text-primary">✓</span> {k}
              </dt>
              <dd className="m-0">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/** A still from about a second in, drawn to a small canvas. */
function useThumbnail(file: File) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.onloadeddata = () => {
      video.currentTime = Math.min(1, (video.duration || 2) / 2);
    };
    video.onseeked = () => {
      if (!alive) return;
      const w = 360;
      const h = Math.round((w * video.videoHeight) / Math.max(1, video.videoWidth));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h || 200;
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      setThumb(canvas.toDataURL("image/jpeg", 0.8));
      video.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
    video.src = url;
    return () => {
      alive = false;
      video.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
  }, [file]);
  return thumb;
}
