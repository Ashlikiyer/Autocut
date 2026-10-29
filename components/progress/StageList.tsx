"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { STAGES, type StageId } from "@/hooks/usePipeline";
import { StepLabel } from "@/components/flow/ui";

/** Where each stage runs, shown under its name. */
const WHERE: Record<StageId, string> = {
  session: "checking today's free videos",
  load: "in your browser",
  extract: "in your browser · audio only",
  transcribe: "whisper · word timestamps",
  watch: "ai · one low-res contact sheet",
  plan: "ai director",
  edit: "in your browser",
  motion: "hyperframes · cards only",
  render: "in your browser",
};

const MESSAGES: Record<StageId, string[]> = {
  session: ["Warming up the scissors…"],
  load: ["Loading the video engine into your browser…", "No uploads, no waiting rooms…"],
  extract: ["Pulling out the audio…", "Squeezing the audio down to a tiny file…"],
  transcribe: [
    "Listening closely…",
    "Writing down every word, ano…",
    "Catching every 'umm'…",
  ],
  watch: ["The AI is watching your video…", "Taking a few quick snapshots…"],
  plan: [
    "The AI director is deciding the style…",
    "Reading the room… and your transcript…",
    "Picking the best moments to zoom…",
    "Choosing emoji and sound effects…",
  ],
  edit: ["Cutting the awkward pauses…", "Lining up captions and effects…"],
  motion: ["HyperFrames is animating your cards…", "Making the titles pop…"],
  render: [
    "Snipping the silences…",
    "Adding the zooms and pops…",
    "Mixing in the sound effects…",
    "Animating your captions…",
    "Almost there, promise…",
  ],
};

function useRotatingMessage(stage: StageId | null) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 3500);
    return () => clearInterval(t);
  }, []);
  if (!stage) return "";
  const list = MESSAGES[stage];
  return list[tick % list.length];
}

function clock(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Elapsed time in the current stage and, once there's enough signal, time left. */
function useStageTiming(startedAt: number | null, stageProgress: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!startedAt) return null;
  const elapsed = Math.max(0, (now - startedAt) / 1000);
  const remaining =
    stageProgress > 0.03 && elapsed > 3 ? (elapsed / stageProgress) * (1 - stageProgress) : null;
  return { elapsed, remaining };
}

export function StageList({
  stage,
  progress,
  stageProgress,
  stageStartedAt,
  footer,
}: {
  stage: StageId | null;
  progress: number;
  stageProgress: number;
  stageStartedAt: number | null;
  footer?: React.ReactNode;
}) {
  const message = useRotatingMessage(stage);
  const timing = useStageTiming(stageStartedAt, stageProgress);
  const current = STAGES.findIndex((s) => s.id === stage);

  return (
    <div className="flex flex-col">
      <StepLabel n={3} />
      <p className="mt-4 mb-0 text-[clamp(72px,9vw,104px)] leading-[0.95] font-medium tracking-[-0.05em] tabular-nums" aria-label={`${progress} percent`}>
        {progress}
        <span className="text-[#3a3a3f]">%</span>
      </p>
      <p className="mt-6 text-lg font-medium" aria-live="polite">
        {message}
      </p>
      <p className="mt-3 text-sm text-[#a1a1a8]">Keep this tab open — the edit is being made on your device.</p>
      <div className="mt-8 h-px w-full bg-[#26262a]" aria-hidden>
        <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${progress}%` }} />
      </div>

      <ol className="m-0 mt-8 flex list-none flex-col p-0">
        {STAGES.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const status = done
            ? "done"
            : active
              ? [
                  stageProgress > 0 ? `${Math.round(stageProgress * 100)}%` : null,
                  timing && timing.remaining !== null ? `~${clock(timing.remaining)} left` : timing ? clock(timing.elapsed) : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "…"
              : "—";
          return (
            <li
              key={s.id}
              className={cn("flex items-center gap-4 border-t border-white/[.06] py-4", !done && !active && "opacity-45")}
            >
              <span className="w-5 font-mono text-[11px] text-ghost">{String(i + 1).padStart(2, "0")}</span>
              <span
                aria-hidden
                className={cn(
                  "grid size-[18px] shrink-0 place-items-center rounded-full text-[10px] font-bold text-primary-foreground",
                  done && "bg-primary",
                  active && "animate-spin border-2 border-primary border-t-transparent",
                  !done && !active && "border border-[#3a3a3f]",
                )}
              >
                {done ? "✓" : ""}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={cn("text-[15px] font-medium", active ? "text-foreground" : "text-subtle")}>{s.label}</span>
                <span className="font-mono text-[11.5px] text-faint">{WHERE[s.id]}</span>
              </span>
              <span className={cn("font-mono text-[11.5px] tabular-nums", done ? "text-faint" : active ? "text-primary" : "text-[#3a3a3f]")}>
                {status}
              </span>
            </li>
          );
        })}
      </ol>
      {footer}
    </div>
  );
}
