"use client";

import { useState } from "react";
import { Download, Loader2, Scissors, Sparkles } from "lucide-react";
import type { EditSettings } from "@/types";
import type { PipelineResult } from "@/hooks/usePipeline";
import { removedSeconds } from "@/lib/engine/edl";
import { EFFECT_INFO, MAX_EFFECTS_SECONDS, PRESETS } from "@/lib/presets";
import { formatDuration } from "@/components/upload/checks";
import { Button } from "@/components/ui/button";
import { GroupLabel, Panel, StepLabel, ToggleLine } from "@/components/flow/ui";
import { SilenceSlider } from "@/components/style-picker/SilenceSlider";
import {
  CAPTION_NAMES,
  CaptionPicker,
  EffectPicker,
  MusicPicker,
  PresetPicker,
} from "@/components/style-picker/StyleControls";
import { FeedbackForm } from "./FeedbackForm";

export function PreviewPanel({
  result,
  musicFile,
  exporting,
  exportProgress,
  onRerender,
  onRedoWithAi,
  onOpenEditor,
  onExport,
  onReset,
}: {
  result: PipelineResult;
  musicFile: File | null;
  exporting: boolean;
  exportProgress: number;
  onRerender: (changes: Partial<EditSettings>, music: File | null) => void;
  /** Ask the AI to edit the whole video again from scratch. */
  onRedoWithAi: () => void;
  /** Open the manual editor with this edit loaded. */
  onOpenEditor: () => void;
  onExport: () => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState<EditSettings>(result.settings);
  const [draftMusic, setDraftMusic] = useState<File | null>(musicFile);
  const set = (p: Partial<EditSettings>) => setDraft((d) => ({ ...d, ...p }));
  const { comp, settings } = result;
  const edl = comp.edl;
  const pct = edl.sourceDuration > 0 ? Math.round((removedSeconds(edl) / edl.sourceDuration) * 100) : 0;
  // The AI's choices aren't a "manual" change; compare everything else.
  const changed =
    JSON.stringify({ ...draft, auto: false }) !== JSON.stringify({ ...result.settings, auto: false }) ||
    draftMusic !== musicFile;
  const cuts = Math.max(0, edl.segments.length - 1) + (edl.segments[0]?.start > 0.05 ? 1 : 0);

  const summary = [
    PRESETS[settings.preset].label,
    settings.captions ? `${CAPTION_NAMES[settings.captionStyle]} captions` : "no captions",
    result.musicTitle ? `${result.musicTitle}` : "no music",
  ].join(" · ");

  return (
    <div className="grid gap-12 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <video
          key={result.previewUrl}
          src={result.previewUrl}
          controls
          autoPlay
          playsInline
          className="mx-auto max-h-[78vh] w-full rounded-[14px] border border-white/[.08] bg-black object-contain"
        />
        <p className="mt-3 font-mono text-[11px] text-faint">quick low-res preview · download renders full quality</p>
      </div>

      <div className="flex min-w-0 flex-col gap-10">
        <header className="flex flex-col gap-4">
          <StepLabel n={4} extra="ready" />
          <p className="m-0 flex items-center gap-4 text-[clamp(44px,5.5vw,64px)] leading-none font-medium tracking-[-0.045em] tabular-nums">
            <span className="text-[#a1a1a8]">{formatDuration(edl.sourceDuration)}</span>
            <span className="text-[0.55em] text-ghost">→</span>
            <span>{formatDuration(edl.outputDuration)}</span>
          </p>
          <p className="font-mono text-[12px] text-faint">{summary}</p>
          <div className="flex flex-wrap gap-2 font-mono text-[10.5px]">
            {result.planSource === "ai" && <Tag accent>AI director</Tag>}
            {result.planSource === "fallback" && <Tag>auto effects · AI was busy</Tag>}
            {result.motion === "hyperframes" && <Tag>HyperFrames motion</Tag>}
          </div>
        </header>

        <dl className="m-0 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-white/[.07] bg-white/[.07] sm:grid-cols-4">
          <Stat value={String(cuts)} label="cuts" />
          <Stat value={`${pct}%`} label="shorter" />
          <Stat value={String(comp.zooms.length)} label="zooms" />
          <Stat value={String(comp.sfx.length)} label="sound effects" />
        </dl>

        {comp.effectsLimited && (
          <p className="text-sm text-[#a1a1a8]">
            Effects are skipped for edits longer than {MAX_EFFECTS_SECONDS / 60} minutes to keep rendering fast in your
            browser. Captions and cuts are still applied.
          </p>
        )}

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button size="xl" disabled={exporting} onClick={onExport} className="min-w-[200px]">
              {exporting ? <Loader2 className="animate-spin" /> : <Download />}
              {exporting ? `Rendering ${Math.round(exportProgress * 100)}%` : "Download MP4"}
            </Button>
            <Button variant="secondary" size="xl" disabled={exporting} onClick={onOpenEditor} className="border-white/10">
              <Scissors /> Edit manually
            </Button>
            <button type="button" onClick={onReset} disabled={exporting} className="px-2 text-sm text-[#a1a1a8] hover:text-foreground disabled:opacity-50">
              Edit another video
            </button>
          </div>
          {exporting && (
            <div className="h-px w-full max-w-md bg-[#26262a]">
              <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(exportProgress * 100)}%` }} />
            </div>
          )}
          {result.usageId > 0 && (
            <p className="font-mono text-[11px] text-faint">
              {result.remainingToday} free {result.remainingToday === 1 ? "video" : "videos"} left today
            </p>
          )}
        </div>

        {result.ai && <AiNotes ai={result.ai} />}

        <section className="flex flex-col gap-6">
          <GroupLabel>Adjust</GroupLabel>
          <div className="flex flex-col gap-2.5">
            <span className="text-sm text-subtle">Style</span>
            <PresetPicker
              compact
              value={draft.preset}
              disabled={exporting}
              onChange={(preset) => set({ preset, captionStyle: preset, effects: PRESETS[preset].defaultEffects })}
            />
            {draft.preset !== result.settings.preset && (
              <p className="font-mono text-[11px] text-faint">the AI director will re-plan effects for this style</p>
            )}
          </div>
          <div className="flex flex-col gap-2.5">
            <span className="text-sm text-subtle">Captions</span>
            <CaptionPicker
              small
              enabled={draft.captions}
              value={draft.captionStyle}
              disabled={exporting}
              onChange={(captions, captionStyle) => set({ captions, captionStyle })}
            />
          </div>
          <div className="flex flex-col gap-2.5">
            <span className="text-sm text-subtle">Effects</span>
            <EffectPicker
              small
              preset={draft.preset}
              value={draft.effects}
              intensity={draft.intensity}
              disabled={exporting}
              onChange={(effects) => set({ effects })}
              onIntensityChange={(intensity) => set({ intensity })}
            />
          </div>
          <div className="flex flex-col gap-2.5">
            <span className="text-sm text-subtle">Music</span>
            <MusicPicker
              small
              value={draft.music}
              file={draftMusic}
              disabled={exporting}
              onChange={(music, file) => {
                set({ music });
                setDraftMusic(file);
              }}
            />
          </div>
          <div className="grid border-t border-white/[.06] sm:grid-cols-2 sm:gap-x-8">
            <ToggleLine id="p-fillers" label="Remove filler words" checked={draft.removeFillers} disabled={exporting} onChange={(removeFillers) => set({ removeFillers })} />
            <ToggleLine id="p-vertical" label="Vertical crop" checked={draft.verticalCrop} disabled={exporting} onChange={(verticalCrop) => set({ verticalCrop })} />
          </div>
          <div className="max-w-md">
            <SilenceSlider value={draft.silenceThreshold} disabled={exporting} onChange={(silenceThreshold) => set({ silenceThreshold })} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="light"
              size="xl"
              disabled={exporting || !changed || (draft.music === "custom" && !draftMusic)}
              onClick={() => onRerender({ ...draft, auto: false }, draft.music === "custom" ? draftMusic : null)}
            >
              Re-render with changes
            </Button>
            <Button variant="secondary" size="xl" disabled={exporting} onClick={onRedoWithAi} className="border-white/10">
              <Sparkles /> {result.settings.auto ? "Let AI try a different edit" : "Let AI edit it instead"}
            </Button>
          </div>
        </section>

        <FeedbackForm usageId={result.usageId} />
      </div>
    </div>
  );
}

function Tag({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span className={accent ? "rounded border border-primary/40 px-1.5 py-0.5 text-primary" : "rounded border border-white/10 px-1.5 py-0.5 text-subtle"}>
      {children}
    </span>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-1 bg-background p-4">
      <dd className="m-0 text-2xl font-medium tracking-[-0.03em] tabular-nums">{value}</dd>
      <dt className="text-[12.5px] text-faint">{label}</dt>
    </div>
  );
}

function AiNotes({ ai }: { ai: NonNullable<PipelineResult["ai"]> }) {
  const { decisions: d, analysis } = ai;
  const labels = EFFECT_INFO.filter((e) => d.effects.includes(e.id));
  return (
    <Panel className="flex flex-col gap-3 p-5">
      <GroupLabel className="text-primary">The AI&apos;s edit</GroupLabel>
      {analysis?.summary && <p className="text-sm text-[#a1a1a8]">{analysis.summary}</p>}
      {d.reason && <p className="text-sm">{d.reason}</p>}
      <div className="flex flex-wrap gap-1.5 font-mono text-[10.5px]">
        <Tag accent>{PRESETS[d.preset].label} style</Tag>
        <Tag>{d.pacing} pacing</Tag>
        <Tag>{d.intensity} effects</Tag>
        {d.removeFillers && <Tag>fillers removed</Tag>}
        {labels.map((e) => (
          <Tag key={e.id}>{e.label.toLowerCase()}</Tag>
        ))}
      </div>
    </Panel>
  );
}
