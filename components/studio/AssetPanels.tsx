"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Plus, Upload } from "lucide-react";
import { SFX_NAMES, type MusicMood } from "@/types";
import { cn } from "@/lib/utils";
import { ALLOWED_EMOJI, PRESET_LIST } from "@/lib/presets";
import { musicTracks } from "@/lib/engine/assets";
import { setCaptions, TEXT_PRESETS, updateSettings } from "@/lib/editor/add";
import { useEditorStore } from "@/lib/editor/store";
import { assetProps, edit, Field, GestureSlider, previewSound, ToggleField } from "./controls";

export type Tab = "text" | "captions" | "sounds" | "music" | "stickers" | "effects";

const row =
  "flex w-full cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 active:scale-[.99]";

function Hint() {
  return <p className="text-xs text-muted-foreground">Click to add at the playhead, or drag onto the timeline.</p>;
}

export function TextAssets() {
  return (
    <div className="flex flex-col gap-2">
      <Hint />
      {TEXT_PRESETS.map((p) => (
        <button key={p.id} type="button" className={row} {...assetProps({ kind: "text", preset: p.id })}>
          <Plus className="size-4 text-primary" />
          <span className="flex flex-col">
            <span className="font-medium">{p.label}</span>
            <span className="text-xs text-muted-foreground">{p.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function CaptionsPanel() {
  const captions = useEditorStore((s) => s.project?.captions);
  if (!captions) return null;
  return (
    <div className="flex flex-col gap-4">
      <ToggleField
        label="Show captions"
        checked={captions.enabled}
        onChange={(enabled) => edit((p) => setCaptions(p, { enabled }))}
      />
      <Field label="Caption style">
        <div className="grid grid-cols-2 gap-2">
          {PRESET_LIST.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={!captions.enabled}
              onClick={() => edit((proj) => setCaptions(proj, { style: p.id }))}
              className={cn(
                "rounded-lg border px-2 py-2 text-left text-xs disabled:opacity-50",
                captions.style === p.id ? "border-primary bg-primary/10" : "hover:bg-muted/60",
              )}
            >
              <span className="mr-1">{p.icon}</span>
              {p.label}
            </button>
          ))}
        </div>
      </Field>
      <p className="text-xs text-muted-foreground">
        Click a caption on the timeline to fix its words. {captions.groups.length} caption groups.
      </p>
    </div>
  );
}

export function SoundsPanel() {
  const sfxVolume = useEditorStore((s) => s.project?.settings.sfxVolume ?? 0.5);
  return (
    <div className="flex flex-col gap-2">
      <Hint />
      <Field label="All sound effects">
        <GestureSlider value={sfxVolume} min={0} max={1} step={0.05} onChange={(v) => edit((p) => updateSettings(p, { sfxVolume: v }))} format={(v) => `${Math.round(v * 100)}%`} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        {SFX_NAMES.map((s) => (
          <div key={s} className={cn(row, "px-2")} {...assetProps({ kind: "sfx", sound: s })}>
            <button
              type="button"
              aria-label={`Preview ${s}`}
              className="grid size-6 shrink-0 place-items-center rounded-full bg-rose-500/20 text-rose-300 hover:bg-rose-500/40"
              onClick={(e) => {
                e.stopPropagation();
                previewSound(`/sfx/${s}.ogg`);
              }}
            >
              <Play className="size-3" />
            </button>
            <span className="truncate text-xs">{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MusicPanel({ onCustomMusic }: { onCustomMusic: (file: File) => void }) {
  const [tracks, setTracks] = useState<{ file: string; mood: MusicMood; title: string }[]>([]);
  const current = useEditorStore((s) => s.project?.music[0]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void musicTracks().then(setTracks);
  }, []);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">One music track plays under the video. Picking another replaces it.</p>
      {tracks.map((t) => {
        const active = current?.source.kind === "bundled" && current.source.file === t.file;
        return (
          <div key={t.file} className={cn(row, active && "border-primary bg-primary/10")} {...assetProps({ kind: "music", mood: t.mood, file: t.file, title: t.title })}>
            <button
              type="button"
              aria-label={`Preview ${t.title}`}
              className="grid size-7 shrink-0 place-items-center rounded-full bg-teal-500/20 text-teal-300 hover:bg-teal-500/40"
              onClick={(e) => {
                e.stopPropagation();
                previewSound(`/music/${t.file}`);
              }}
            >
              <Play className="size-3.5" />
            </button>
            <span className="flex flex-col">
              <span className="font-medium">{t.title}</span>
              <span className="text-xs capitalize text-muted-foreground">{t.mood}</span>
            </span>
          </div>
        );
      })}
      <button type="button" className={row} onClick={() => input.current?.click()}>
        <Upload className="size-4" /> Upload your own…
      </button>
      <input
        ref={input}
        type="file"
        accept="audio/*,.mp3,.m4a,.wav,.ogg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && f.size <= 30 * 1024 * 1024) {
            onCustomMusic(f);
            useEditorStore.getState().add({ kind: "custom-music", name: f.name }, 0);
          }
          e.target.value = "";
        }}
      />
      <p className="text-[11px] text-muted-foreground">Only upload music you have the rights to use.</p>
    </div>
  );
}

export function StickersPanel() {
  return (
    <div className="flex flex-col gap-2">
      <Hint />
      <div className="grid grid-cols-6 gap-1">
        {ALLOWED_EMOJI.map((e) => (
          <button
            key={e}
            type="button"
            className="grid aspect-square place-items-center rounded-md text-2xl hover:bg-muted/60"
            {...assetProps({ kind: "sticker", emoji: e })}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

export function EffectsPanel() {
  const settings = useEditorStore((s) => s.project?.settings);
  if (!settings) return null;
  const set = (patch: Partial<typeof settings>) => edit((p) => updateSettings(p, patch));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Hint />
        <button type="button" className={row} {...assetProps({ kind: "zoom", style: "punch" })}>
          🔍 <span>Zoom punch-in</span>
        </button>
        <button type="button" className={row} {...assetProps({ kind: "zoom", style: "slow" })}>
          🎥 <span>Slow push-in</span>
        </button>
        <button type="button" className={row} {...assetProps({ kind: "zoom", style: "punch", shake: true })}>
          📳 <span>Zoom with shake</span>
        </button>
        <button type="button" className={row} {...assetProps({ kind: "transition" })}>
          ⚡ <span>Flash transition</span>
        </button>
      </div>
      <div className="flex flex-col gap-1 border-t pt-3">
        <ToggleField label="Jump-cut zoom" hint="Alternate close/wide at each cut" checked={settings.cutZoom} onChange={(v) => set({ cutZoom: v })} />
        <ToggleField label="Color boost" checked={settings.colorBoost} onChange={(v) => set({ colorBoost: v })} />
        <ToggleField label="Cinematic vignette" checked={settings.vignette} onChange={(v) => set({ vignette: v })} />
        <ToggleField label="Progress bar" checked={settings.progressBar} onChange={(v) => set({ progressBar: v })} />
        <ToggleField label="Vertical 9:16" checked={settings.vertical} onChange={(v) => set({ vertical: v })} />
      </div>
    </div>
  );
}
