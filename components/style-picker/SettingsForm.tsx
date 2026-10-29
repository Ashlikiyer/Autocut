"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EditSettings, PresetId } from "@/types";
import { Button } from "@/components/ui/button";
import { PRESETS } from "@/lib/presets";
import { Chip, ChipGroup, GroupLabel, ScreenTitle, ToggleLine } from "@/components/flow/ui";
import { MockCaption } from "@/components/landing/MockFrame";
import { SilenceSlider } from "./SilenceSlider";
import {
  CAPTION_NAMES,
  CaptionPicker,
  capRange,
  defaultSettings,
  EffectPicker,
  MusicPicker,
  PresetPicker,
} from "./StyleControls";

const LANGUAGES: { id: EditSettings["language"]; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "en", label: "English" },
  { id: "tl", label: "Filipino / Taglish" },
];

const MUSIC_LABEL: Record<EditSettings["music"], string> = {
  auto: "AI pick",
  none: "None",
  upbeat: "Upbeat",
  chill: "Chill",
  playful: "Playful",
  dramatic: "Dramatic",
  custom: "Your track",
};

export function SettingsForm({
  fileName,
  onSubmit,
  onBack,
  isPortrait,
}: {
  fileName: string;
  onSubmit: (s: EditSettings, music: File | null) => void;
  onBack: () => void;
  /** Hide the 9:16 toggle's hint when the video is already vertical. */
  isPortrait: boolean;
}) {
  const [s, setS] = useState<EditSettings>(defaultSettings());
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const set = (p: Partial<EditSettings>) => setS((prev) => ({ ...prev, ...p }));

  const choosePreset = (preset: PresetId) =>
    set({ preset, captionStyle: preset, effects: PRESETS[preset].defaultEffects });

  return (
    <form
      className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px]"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(s, s.music === "custom" ? musicFile : null);
      }}
    >
      <div className="flex min-w-0 flex-col gap-10">
        <ScreenTitle step={2} title="Choose a style" subtitle="You can still change captions and effects after the first render." />

        <section className="flex flex-col gap-3">
          <GroupLabel>Who edits</GroupLabel>
          <div role="radiogroup" aria-label="Editing mode" className="grid gap-2.5 sm:grid-cols-2">
            <ModeCard
              active={s.auto}
              onClick={() => set({ auto: true })}
              title="Let AI edit everything"
              body="The AI watches your video, then picks the style, effects, pacing and music itself."
              badge="Recommended"
            />
            <ModeCard
              active={!s.auto}
              onClick={() => set({ auto: false })}
              title="I'll choose"
              body="Pick the style, captions and exactly which effects you want."
            />
          </div>
        </section>

        {!s.auto && (
          <>
            <section className="flex flex-col gap-3">
              <GroupLabel>Preset</GroupLabel>
              <PresetPicker value={s.preset} onChange={choosePreset} />
            </section>
            <section className="flex flex-col gap-3">
              <GroupLabel>Captions</GroupLabel>
              <CaptionPicker
                enabled={s.captions}
                value={s.captionStyle}
                onChange={(captions, captionStyle) => set({ captions, captionStyle })}
              />
            </section>
            <section className="flex flex-col gap-3">
              <GroupLabel>Effects</GroupLabel>
              <EffectPicker
                preset={s.preset}
                value={s.effects}
                intensity={s.intensity}
                onChange={(effects) => set({ effects })}
                onIntensityChange={(intensity) => set({ intensity })}
              />
            </section>
          </>
        )}

        <section className="flex flex-col gap-3">
          <GroupLabel>Music mood</GroupLabel>
          <MusicPicker
            value={s.music}
            file={musicFile}
            onChange={(music, file) => {
              set({ music });
              setMusicFile(file);
            }}
          />
        </section>

        <section className="flex flex-col border-t border-white/[.06]">
          {s.auto && (
            <ToggleLine
              id="share-frames"
              label="Let AI see the video"
              hint="sends one small contact sheet of snapshots · never stored"
              checked={s.shareFrames}
              onChange={(shareFrames) => set({ shareFrames })}
            />
          )}
          {s.auto && (
            <ToggleLine id="captions-auto" label="Animated captions" hint="word by word, as you speak" checked={s.captions} onChange={(captions) => set({ captions })} />
          )}
          {!s.auto && (
            <ToggleLine id="fillers" label="Remove filler words" hint="um, uh, ano, parang…" checked={s.removeFillers} onChange={(removeFillers) => set({ removeFillers })} />
          )}
          <ToggleLine
            id="vertical"
            label="Vertical crop"
            hint={isPortrait ? "already vertical · 1080×1920" : "landscape → 1080×1920"}
            checked={s.verticalCrop}
            onChange={(verticalCrop) => set({ verticalCrop })}
          />
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[.06] py-4">
            <span className="text-[15px] font-medium">Speech language</span>
            <ChipGroup label="Speech language">
              {LANGUAGES.map((l) => (
                <Chip key={l.id} small on={s.language === l.id} onClick={() => set({ language: l.id })}>
                  {l.label}
                </Chip>
              ))}
            </ChipGroup>
          </div>
          {!s.auto && (
            <div className="border-b border-white/[.06] py-4">
              <button
                type="button"
                onClick={() => setAdvanced((a) => !a)}
                className="flex items-center gap-1.5 text-[15px] font-medium"
                aria-expanded={advanced}
              >
                Pacing
                <ChevronDown className={cn("size-4 text-faint transition-transform", advanced && "rotate-180")} />
              </button>
              {advanced && (
                <div className="mt-4 max-w-md">
                  <SilenceSlider value={s.silenceThreshold} onChange={(silenceThreshold) => set({ silenceThreshold })} />
                </div>
              )}
            </div>
          )}
        </section>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="xl" onClick={onBack} className="border-white/10">
            Back
          </Button>
          <Button type="submit" variant="light" size="xl" disabled={s.music === "custom" && !musicFile}>
            {s.auto ? "Let AI edit it →" : "Make my edit →"}
          </Button>
        </div>
      </div>

      <LivePreview settings={s} fileName={fileName} />
    </form>
  );
}

/** The sticky 9:16 card on the right: shows the chosen caption look and effect density. */
function LivePreview({ settings: s, fileName }: { settings: EditSettings; fileName: string }) {
  const sample: Record<PresetId, { words: string[]; hi: number }> = {
    energetic: { words: ["THE", "SECRET", "NOBODY", "TELLS", "YOU"], hi: 1 },
    clean: { words: ["Here's", "what", "I", "learned"], hi: -1 },
    funny: { words: ["WAIT", "WHAT?!"], hi: 1 },
    podcast: { words: ["So", "the", "real", "question", "is,", "why", "does", "it", "work?"], hi: 3 },
    creator: { words: ["SECRET"], hi: -1 },
  };
  const look = s.auto ? "energetic" : s.captionStyle;
  const rows: [string, string][] = s.auto
    ? [["style", "AI decides"], ["effects", "AI decides"], ["music", MUSIC_LABEL[s.music]]]
    : [
        ["zooms/min", s.effects.includes("zoom") ? capRange(s.preset, "zooms") : "0"],
        ["sfx/min", s.effects.includes("sfx") ? capRange(s.preset, "sfx") : "0"],
        ["captions", s.captions ? CAPTION_NAMES[s.captionStyle] : "Off"],
        ["music", MUSIC_LABEL[s.music]],
      ];
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-24 flex flex-col gap-3">
        <GroupLabel>Live preview</GroupLabel>
        <div className="relative aspect-[9/16] overflow-hidden rounded-[12px] border border-white/[.08] bg-[repeating-linear-gradient(45deg,#141416,#141416_10px,#17171a_10px,#17171a_20px)]">
          <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 truncate px-6 text-center font-mono text-[10px] text-ghost">{fileName}</span>
          {s.captions && (
            <MockCaption
              look={look}
              words={sample[look].words}
              hi={sample[look].hi}
              className={look === "creator" ? "bottom-[38%]" : "bottom-[16%]"}
              scale={look === "creator" ? 1.6 : 1.25}
            />
          )}
          <span className="absolute bottom-0 left-0 h-[3px] w-[30%] bg-primary" aria-hidden />
        </div>
        <dl className="m-0 flex flex-col gap-1.5 font-mono text-[11.5px]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <dt className="text-faint">{k}</dt>
              <dd className="m-0">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  );
}

function ModeCard({
  active,
  onClick,
  title,
  body,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  body: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex flex-col gap-2.5 rounded-[10px] border p-4 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active ? "border-primary bg-[#141416]" : "border-white/[.07] bg-[#111113] hover:border-white/15",
      )}
    >
      <span className="flex w-full items-center justify-between gap-3">
        <span className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
          {title}
          {badge && (
            <span className="rounded bg-primary px-1.5 py-0.5 font-mono text-[9.5px] font-medium tracking-wide text-primary-foreground uppercase">
              {badge}
            </span>
          )}
        </span>
        <span className={cn("size-3.5 shrink-0 rounded-full", active ? "border-4 border-primary" : "border border-[#3a3a3f]")} aria-hidden />
      </span>
      <span className="text-[13px] leading-relaxed text-[#a1a1a8]">{body}</span>
    </button>
  );
}
