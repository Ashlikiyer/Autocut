"use client";

import { useRef } from "react";
import { Upload } from "lucide-react";
import type {
  EditSettings,
  EffectIntensity,
  EffectKind,
  MusicChoice,
  PresetId,
} from "@/types";
import { cn } from "@/lib/utils";
import { EFFECT_INFO, PRESET_LIST, PRESETS } from "@/lib/presets";
import { Chip, ChipGroup } from "@/components/flow/ui";

/** Effects per minute for a preset, as "min–max" (the caps the AI director works within). */
export function capRange(id: PresetId, kind: "zooms" | "sfx") {
  const [a, b] = PRESETS[id].caps[kind];
  return a === b ? String(a) : `${a}–${b}`;
}

/** Preset cards: number, name, radio dot, description and effect density. */
export function PresetPicker({
  value,
  onChange,
  disabled,
  compact,
}: {
  value: PresetId;
  onChange: (p: PresetId) => void;
  disabled?: boolean;
  /** Small chips instead of cards, for the preview sidebar. */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <ChipGroup label="Style">
        {PRESET_LIST.map((p) => (
          <Chip key={p.id} small on={value === p.id} disabled={disabled} onClick={() => onChange(p.id)}>
            {p.label}
          </Chip>
        ))}
      </ChipGroup>
    );
  }
  return (
    <div role="radiogroup" aria-label="Style" className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {PRESET_LIST.map((p) => {
        const on = value === p.id;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(p.id)}
            className={cn(
              "flex min-h-[150px] flex-col gap-2.5 rounded-[10px] border p-4 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
              on ? "border-primary bg-[#141416]" : "border-white/[.07] bg-[#111113] hover:border-white/15",
            )}
          >
            <span className="flex w-full items-center justify-between gap-3">
              <span className="text-[15px] font-semibold">{p.label}</span>
              <span className={cn("size-3.5 rounded-full", on ? "border-4 border-primary" : "border border-[#3a3a3f]")} aria-hidden />
            </span>
            <span className="flex-1 text-[13px] leading-relaxed text-[#a1a1a8]">{p.tagline}.</span>
            <span className="flex gap-4 font-mono text-[11px] text-faint">
              <span>zoom {capRange(p.id, "zooms")}</span>
              <span>sfx {capRange(p.id, "sfx")}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** What each caption look is called in the UI. */
export const CAPTION_NAMES: Record<PresetId, string> = {
  energetic: "Bold pop",
  clean: "Minimal",
  funny: "Comic",
  podcast: "Two-line",
  creator: "One word",
};

/** Caption chips: off, or one of the caption looks. */
export function CaptionPicker({
  enabled,
  value,
  onChange,
  disabled,
  small,
}: {
  enabled: boolean;
  value: PresetId;
  onChange: (enabled: boolean, style: PresetId) => void;
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <ChipGroup label="Captions">
      {PRESET_LIST.map((p) => (
        <Chip key={p.id} small={small} disabled={disabled} on={enabled && value === p.id} onClick={() => onChange(true, p.id)}>
          {CAPTION_NAMES[p.id]}
        </Chip>
      ))}
      <Chip small={small} disabled={disabled} on={!enabled} onClick={() => onChange(false, value)}>
        Off
      </Chip>
    </ChipGroup>
  );
}

const MUSIC_OPTIONS: { id: Exclude<MusicChoice, "custom">; label: string }[] = [
  { id: "auto", label: "AI pick" },
  { id: "upbeat", label: "Upbeat" },
  { id: "chill", label: "Chill" },
  { id: "playful", label: "Playful" },
  { id: "dramatic", label: "Dramatic" },
  { id: "none", label: "None" },
];

/** Music mood chips plus "upload my own". */
export function MusicPicker({
  value,
  file,
  onChange,
  disabled,
  small,
}: {
  value: MusicChoice;
  file: File | null;
  onChange: (choice: MusicChoice, file: File | null) => void;
  disabled?: boolean;
  small?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-2.5">
      <ChipGroup label="Music mood">
        {MUSIC_OPTIONS.map((m) => (
          <Chip key={m.id} small={small} disabled={disabled} on={value === m.id} onClick={() => onChange(m.id, null)}>
            {m.label}
          </Chip>
        ))}
        <Chip small={small} disabled={disabled} on={value === "custom"} onClick={() => input.current?.click()}>
          <span className="flex items-center gap-1.5">
            <Upload className="size-3.5" /> {value === "custom" && file ? "Change file" : "Upload my own"}
          </span>
        </Chip>
      </ChipGroup>
      {value === "custom" && file && <p className="truncate font-mono text-[11.5px] text-subtle">♪ {file.name}</p>}
      <p className="font-mono text-[11px] text-faint">
        Ducks under speech · only upload music you have the rights to
      </p>
      <input
        ref={input}
        type="file"
        accept="audio/*,.mp3,.m4a,.wav,.ogg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && f.size <= 30 * 1024 * 1024) onChange("custom", f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

const INTENSITIES: { id: EffectIntensity; label: string }[] = [
  { id: "less", label: "Less" },
  { id: "normal", label: "Normal" },
  { id: "more", label: "More" },
];

/** Multi-select effect chips, plus how many of them to add. */
export function EffectPicker({
  preset,
  value,
  intensity,
  onChange,
  onIntensityChange,
  disabled,
  small,
}: {
  preset: PresetId;
  value: EffectKind[];
  intensity: EffectIntensity;
  onChange: (effects: EffectKind[]) => void;
  onIntensityChange: (i: EffectIntensity) => void;
  disabled?: boolean;
  small?: boolean;
}) {
  const selected = new Set(value);
  const toggle = (id: EffectKind) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    // Keep a stable order so settings compare equal.
    onChange(EFFECT_INFO.map((e) => e.id).filter((k) => next.has(k)));
  };
  const quick = (label: string, effects: EffectKind[]) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(effects)}
      className="font-mono text-[11px] text-faint hover:text-foreground disabled:opacity-50"
    >
      {label}
    </button>
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-mono text-[11px] text-subtle">{value.length} selected</span>
        {quick("all", EFFECT_INFO.map((e) => e.id))}
        {quick("none", [])}
        {quick("style default", PRESETS[preset].defaultEffects)}
      </div>
      <div role="group" aria-label="Effects" className="flex flex-wrap gap-2">
        {EFFECT_INFO.map((e) => (
          <Chip key={e.id} role="checkbox" small={small} disabled={disabled} on={selected.has(e.id)} onClick={() => toggle(e.id)}>
            <span title={e.hint}>
              <span aria-hidden className="mr-1.5">{e.icon}</span>
              {e.label}
            </span>
          </Chip>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-[11px] text-faint">amount</span>
        <ChipGroup label="Effect amount">
          {INTENSITIES.map((i) => (
            <Chip key={i.id} small disabled={disabled || value.length === 0} on={intensity === i.id} onClick={() => onIntensityChange(i.id)}>
              {i.label}
            </Chip>
          ))}
        </ChipGroup>
      </div>
    </div>
  );
}

export function defaultSettings(preset: PresetId = "energetic"): EditSettings {
  return {
    auto: true,
    shareFrames: true,
    silenceThreshold: 0.5,
    language: "auto",
    preset,
    captions: true,
    captionStyle: preset,
    removeFillers: true,
    verticalCrop: true,
    effects: PRESETS[preset].defaultEffects,
    intensity: "normal",
    music: "auto",
  };
}

export const presetLabel = (id: PresetId) => PRESETS[id].label;
