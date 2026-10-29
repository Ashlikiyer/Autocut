"use client";

import { useRef } from "react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useEditorStore } from "@/lib/editor/store";
import type { Project } from "@/lib/editor/project";
import type { Asset } from "@/lib/editor/add";

/** Drag payload type for assets dropped on the timeline. */
export const ASSET_MIME = "application/x-autocut-asset";

/** Applies an edit to the project (one undo step, or part of a running gesture). */
export const edit = (fn: (p: Project) => Project) => useEditorStore.getState().apply(fn);

/** Makes an element draggable onto the timeline and clickable to add at the playhead. */
export function assetProps(asset: Asset) {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(ASSET_MIME, JSON.stringify(asset));
      e.dataTransfer.effectAllowed = "copy";
    },
    onClick: () => useEditorStore.getState().add(asset),
  };
}

let previewAudio: HTMLAudioElement | null = null;
/** Plays a short preview of a sound or track (click again to stop). */
export function previewSound(url: string) {
  if (previewAudio && previewAudio.src.endsWith(url) && !previewAudio.paused) {
    previewAudio.pause();
    return;
  }
  previewAudio?.pause();
  previewAudio = new Audio(url);
  void previewAudio.play().catch(() => {});
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * A slider whose whole drag is a single undo step. `format` shows the value.
 */
export function GestureSlider({
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const active = useRef(false);
  return (
    <div className="flex items-center gap-3">
      <Slider
        className="flex-1"
        min={min}
        max={max}
        step={step}
        value={value}
        onValueChange={(v) => {
          if (!active.current) {
            active.current = true;
            useEditorStore.getState().beginGesture();
          }
          onChange(typeof v === "number" ? v : v[0]);
        }}
        onValueCommitted={() => {
          if (active.current) useEditorStore.getState().endGesture();
          active.current = false;
        }}
      />
      <span className="w-12 text-right font-mono text-xs tabular-nums">{format ? format(value) : value.toFixed(2)}</span>
    </div>
  );
}

/** Seconds input (output time). */
export function TimeInput({ value, onChange, min = 0, max }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <input
      type="number"
      step={0.1}
      min={min}
      max={max}
      value={Number(value.toFixed(2))}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
      className="h-8 w-full rounded-md border bg-transparent px-2 font-mono text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30"
    />
  );
}

/**
 * Text input whose typing session (focus → blur) is a single undo step.
 */
export function GestureText({
  value,
  onChange,
  multiline,
  placeholder,
  onCommit,
}: {
  value: string;
  onChange?: (v: string) => void;
  /** Called on blur instead of on every keystroke (for edits that re-time). */
  onCommit?: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const cls =
    "w-full rounded-md border bg-transparent px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30";
  const props = {
    placeholder,
    className: cls,
    ...(onCommit
      ? {
          defaultValue: value,
          onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            if (e.target.value !== value) onCommit(e.target.value);
          },
        }
      : {
          value,
          onFocus: () => useEditorStore.getState().beginGesture(),
          onBlur: () => useEditorStore.getState().endGesture(),
          onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange?.(e.target.value),
        }),
  };
  return multiline ? <textarea rows={3} {...props} /> : <input {...props} />;
}

export function ToggleField({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-center justify-between gap-3 py-0.5">
      <span className="flex flex-col">
        <span className="text-sm">{label}</span>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

export function NativeSelect<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
