"use client";

import { SILENCE } from "@/lib/limits";
import { Slider } from "@/components/ui/slider";

function describe(t: number) {
  if (t <= 0.35) return "tight · fast-paced, removes short breaths";
  if (t <= 0.7) return "balanced · natural pacing";
  return "relaxed · only removes long pauses";
}

export function SilenceSlider({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor="silence" className="text-sm">Cut pauses longer than</label>
        <span className="font-mono text-sm tabular-nums">{value.toFixed(2)} s</span>
      </div>
      <Slider
        id="silence"
        min={SILENCE.minThreshold}
        max={SILENCE.maxThreshold}
        step={0.05}
        value={value}
        disabled={disabled}
        onValueChange={(v) => onChange(typeof v === "number" ? v : v[0])}
      />
      <p className="font-mono text-[11px] text-faint">{describe(value)}</p>
    </div>
  );
}
