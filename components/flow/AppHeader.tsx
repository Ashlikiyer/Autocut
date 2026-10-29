"use client";

import { cn } from "@/lib/utils";
import { Logo } from "@/components/site/chrome";

export type FlowStep = "upload" | "style" | "processing" | "preview";

const STEPS: { id: FlowStep; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "style", label: "Style" },
  { id: "processing", label: "Processing" },
  { id: "preview", label: "Preview" },
];

/** Header of the editing flow: logo, the four steps, and today's free videos. */
export function AppHeader({ step, remaining }: { step: FlowStep; remaining: number | null }) {
  const current = STEPS.findIndex((s) => s.id === step);
  return (
    <header className="sticky top-0 z-20 border-b border-white/[.06] bg-background/85 backdrop-blur-md">
      <div className="mx-auto grid max-w-[1200px] grid-cols-[1fr_auto] items-center gap-6 px-4 py-3.5 sm:px-8 md:grid-cols-[1fr_auto_1fr]">
        <Logo />
        <ol className="m-0 hidden list-none gap-5 p-0 md:flex" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2" aria-current={i === current ? "step" : undefined}>
              <span className={cn("font-mono text-[11px] font-medium", i <= current ? "text-primary" : "text-ghost")}>
                {i < current ? "✓" : String(i + 1).padStart(2, "0")}
              </span>
              <span
                className={cn(
                  "text-[13px] font-medium",
                  i === current ? "text-foreground" : i < current ? "text-[#8b8b92]" : "text-ghost",
                )}
              >
                {s.label}
              </span>
            </li>
          ))}
        </ol>
        <div className="flex justify-end">
          <span className="rounded-md border border-white/10 px-2.5 py-1.5 font-mono text-[11px] text-subtle">
            {remaining === null ? "3 free / day" : `${remaining} free left today`}
          </span>
        </div>
      </div>
    </header>
  );
}
