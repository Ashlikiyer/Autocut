"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Play, RotateCcw, Trash2 } from "lucide-react";
import { SFX_NAMES, type SfxName } from "@/types";
import { ALLOWED_EMOJI, PRESET_LIST } from "@/lib/presets";
import { musicTracks } from "@/lib/engine/assets";
import { DEFAULT_STICKER, DEFAULT_TEXT_POSITION } from "@/lib/editor/convert";
import { clipRanges, moveItem, projectDuration, setCaptionText, trimClip, trimItem, updateItem } from "@/lib/editor/ops";
import { setCaptions } from "@/lib/editor/add";
import { CAPTION_FONTS, type ItemRef, type Project, type TextAnimation } from "@/lib/editor/project";
import { useEditorStore } from "@/lib/editor/store";
import { Button } from "@/components/ui/button";
import { edit, Field, GestureSlider, GestureText, NativeSelect, previewSound, TimeInput, ToggleField } from "./controls";

const ANIMATIONS: { value: TextAnimation; label: string }[] = [
  { value: "none", label: "None" },
  { value: "fade", label: "Fade" },
  { value: "slide", label: "Slide up" },
  { value: "pop", label: "Pop" },
  { value: "bounce", label: "Bounce" },
];

const pct = (v: number) => `${Math.round(v * 100)}%`;
const secs = (v: number) => `${v.toFixed(1)}s`;

/** Start/end inputs for any item with a span. */
function SpanFields({ refItem, start, end }: { refItem: ItemRef; start: number; end: number }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Start (s)">
        <TimeInput value={start} onChange={(v) => edit((p) => trimItem(p, refItem, "start", v))} />
      </Field>
      <Field label="End (s)">
        <TimeInput value={end} onChange={(v) => edit((p) => trimItem(p, refItem, "end", v))} />
      </Field>
    </div>
  );
}

export function PropertiesPanel({ selection }: { selection: ItemRef }) {
  const project = useEditorStore((s) => s.project);
  if (!project) return null;
  const close = () => useEditorStore.getState().select(null);
  const remove = () => useEditorStore.getState().deleteSelected();
  const title = {
    texts: "Text",
    stickers: "Sticker",
    clips: "Video clip",
    captions: "Caption",
    sfx: "Sound effect",
    music: "Music",
    zooms: "Zoom",
    transitions: "Transition",
  }[selection.track];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" onClick={close} aria-label="Back to assets">
          <ArrowLeft />
        </Button>
        <h2 className="flex-1 text-sm font-semibold">{title}</h2>
        <Button variant="ghost" size="icon-sm" onClick={remove} aria-label="Delete" title="Delete (Del)">
          <Trash2 />
        </Button>
      </div>
      <Body project={project} selection={selection} />
    </div>
  );
}

function Body({ project, selection: ref }: { project: Project; selection: ItemRef }) {
  const set = <T extends object>(patch: Partial<T>) => edit((p) => updateItem<T>(p, ref, patch));

  if (ref.track === "texts") {
    const t = project.texts.find((x) => x.id === ref.id);
    if (!t) return null;
    const plain = t.variant === "plain";
    const d = DEFAULT_TEXT_POSITION[t.variant];
    return (
      <>
        <Field label="Text">
          <GestureText multiline value={t.text} onChange={(text) => set({ text })} />
        </Field>
        {t.variant === "step" && (
          <Field label="Label">
            <GestureText value={t.label ?? ""} onChange={(label) => set({ label })} placeholder="STEP 1" />
          </Field>
        )}
        {t.variant === "hook" && (
          <>
            <Field label="Coloured words" hint="Words from the title to show in the accent colour">
              <GestureText value={t.accent ?? ""} onChange={(accent) => set({ accent })} />
            </Field>
            <Field label="Sticker">
              <GestureText value={t.sticker ?? ""} onChange={(sticker) => set({ sticker })} placeholder="NO COURSE NEEDED" />
            </Field>
          </>
        )}
        {plain && (
          <>
            <Field label="Font">
              <NativeSelect value={t.font} options={CAPTION_FONTS.map((f) => ({ value: f, label: f }))} onChange={(font) => set({ font })} />
            </Field>
            <Field label="Size">
              <GestureSlider value={t.size} min={0.03} max={0.2} step={0.005} onChange={(size) => set({ size })} format={pct} />
            </Field>
            <Field label="Colour">
              <input type="color" value={t.color} onChange={(e) => set({ color: e.target.value.toUpperCase() })} className="h-8 w-16 cursor-pointer rounded border bg-transparent" />
            </Field>
            <Field label="Animation">
              <NativeSelect value={t.animation} options={ANIMATIONS} onChange={(animation) => set({ animation })} />
            </Field>
          </>
        )}
        <SpanFields refItem={ref} start={t.start} end={t.end} />
        <p className="text-[11px] text-muted-foreground">Drag it on the preview to move it.</p>
        {(t.x !== d.x || t.y !== d.y) && (
          <Button variant="ghost" size="sm" onClick={() => set({ x: d.x, y: d.y })}>
            <RotateCcw /> Reset position
          </Button>
        )}
      </>
    );
  }

  if (ref.track === "stickers") {
    const s = project.stickers.find((x) => x.id === ref.id);
    if (!s) return null;
    return (
      <>
        <Field label="Emoji">
          <div className="grid grid-cols-8 gap-0.5">
            {ALLOWED_EMOJI.map((e) => (
              <button key={e} type="button" onClick={() => set({ emoji: e })}
                className={`grid aspect-square place-items-center rounded text-lg ${e === s.emoji ? "bg-primary/20 ring-1 ring-primary" : "hover:bg-muted/60"}`}>
                {e}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Size">
          <GestureSlider value={s.size} min={0.06} max={0.5} step={0.01} onChange={(size) => set({ size })} format={pct} />
        </Field>
        <SpanFields refItem={ref} start={s.start} end={s.end} />
        <p className="text-[11px] text-muted-foreground">Drag it on the preview to move it; drag the corner to resize.</p>
        {(s.x !== DEFAULT_STICKER.x || s.y !== DEFAULT_STICKER.y) && (
          <Button variant="ghost" size="sm" onClick={() => set({ x: DEFAULT_STICKER.x, y: DEFAULT_STICKER.y })}>
            <RotateCcw /> Reset position
          </Button>
        )}
      </>
    );
  }

  if (ref.track === "captions") {
    const g = project.captions.groups.find((x) => x.id === ref.id);
    if (!g) return null;
    return (
      <>
        <Field label="Words" hint="Fix what was heard. Timing is spread evenly across the words.">
          <GestureText key={g.id + g.words.length} multiline value={g.words.map((w) => w.text).join(" ")}
            onCommit={(text) => edit((p) => setCaptionText(p, g.id, text))} />
        </Field>
        <SpanFields refItem={ref} start={g.start} end={g.end} />
        <div className="flex flex-col gap-3 border-t pt-3">
          <ToggleField label="Show captions" checked={project.captions.enabled}
            onChange={(enabled) => edit((p) => setCaptions(p, { enabled }))} />
          <Field label="Caption style (all captions)">
            <NativeSelect value={project.captions.style}
              options={PRESET_LIST.map((p) => ({ value: p.id, label: `${p.icon} ${p.label}` }))}
              onChange={(style) => edit((p) => setCaptions(p, { style }))} />
          </Field>
        </div>
      </>
    );
  }

  if (ref.track === "sfx") {
    const s = project.sfx.find((x) => x.id === ref.id);
    if (!s) return null;
    return (
      <>
        <Field label="Sound">
          <div className="flex gap-2">
            <NativeSelect<SfxName> value={s.sound} options={SFX_NAMES.map((n) => ({ value: n, label: n }))}
              onChange={(sound) => set({ sound })} />
            <Button variant="outline" size="icon" onClick={() => previewSound(`/sfx/${s.sound}.ogg`)} aria-label="Preview">
              <Play />
            </Button>
          </div>
        </Field>
        <Field label="Volume">
          <GestureSlider value={s.volume} min={0} max={2} step={0.05} onChange={(volume) => set({ volume })} format={pct} />
        </Field>
        <Field label="Start (s)">
          <TimeInput value={s.start} onChange={(v) => edit((p) => moveItem(p, ref, v))} />
        </Field>
      </>
    );
  }

  if (ref.track === "music") {
    const m = project.music.find((x) => x.id === ref.id);
    if (!m) return null;
    return (
      <>
        <MusicTrackField current={m.source.kind === "bundled" ? m.source.file : undefined} customName={m.source.kind === "custom" ? m.source.name : undefined} />
        <Field label="Volume">
          <GestureSlider value={m.volume} min={0} max={0.5} step={0.01} onChange={(volume) => set({ volume })} format={pct} />
        </Field>
        <Field label="Fade in">
          <GestureSlider value={m.fadeIn} min={0} max={5} step={0.1} onChange={(fadeIn) => set({ fadeIn })} format={secs} />
        </Field>
        <Field label="Fade out">
          <GestureSlider value={m.fadeOut} min={0} max={5} step={0.1} onChange={(fadeOut) => set({ fadeOut })} format={secs} />
        </Field>
        <ToggleField label="Lower under speech" hint="Ducks the music while someone talks" checked={m.ducking} onChange={(ducking) => set({ ducking })} />
        <SpanFields refItem={ref} start={m.start} end={m.end} />
      </>
    );
  }

  if (ref.track === "zooms") {
    const z = project.zooms.find((x) => x.id === ref.id);
    if (!z) return null;
    return (
      <>
        <Field label="Zoom">
          <GestureSlider value={z.scale} min={1} max={1.5} step={0.01} onChange={(scale) => set({ scale })} format={(v) => `${v.toFixed(2)}×`} />
        </Field>
        <Field label="Style">
          <NativeSelect value={z.style} options={[{ value: "punch", label: "Punch-in" }, { value: "slow", label: "Slow push-in" }]}
            onChange={(style) => set({ style })} />
        </Field>
        <ToggleField label="Camera shake" checked={z.shake} onChange={(shake) => set({ shake })} />
        <SpanFields refItem={ref} start={z.start} end={z.end} />
      </>
    );
  }

  if (ref.track === "transitions") {
    const t = project.transitions.find((x) => x.id === ref.id);
    if (!t) return null;
    return (
      <>
        <p className="text-sm text-muted-foreground">A quick white flash.</p>
        <Field label="At (s)">
          <TimeInput value={t.at} onChange={(v) => edit((p) => moveItem(p, ref, v))} max={projectDuration(project)} />
        </Field>
      </>
    );
  }

  // Video clip
  const c = clipRanges(project.clips).find((x) => x.id === ref.id);
  if (!c) return null;
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Plays {secs(c.end - c.start)} of your video. Drag its edges on the timeline to trim, or press S to split at the playhead.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="From source (s)">
          <TimeInput value={c.sourceIn} onChange={(v) => edit((p) => trimClip(p, c.id, "in", v))} />
        </Field>
        <Field label="To source (s)">
          <TimeInput value={c.sourceOut} onChange={(v) => edit((p) => trimClip(p, c.id, "out", v))} max={project.info.duration} />
        </Field>
      </div>
    </>
  );
}

function MusicTrackField({ current, customName }: { current?: string; customName?: string }) {
  const [tracks, setTracks] = useState<{ file: string; mood: import("@/types").MusicMood; title: string }[]>([]);
  useEffect(() => {
    void musicTracks().then(setTracks);
  }, []);
  if (customName) return <Field label="Track"><p className="truncate text-sm">{customName}</p></Field>;
  return (
    <Field label="Track" hint="Upload your own from the Music tab">
      <NativeSelect
        value={current ?? ""}
        options={[...(current ? [] : [{ value: "", label: "Choose…" }]), ...tracks.map((t) => ({ value: t.file, label: `${t.title} (${t.mood})` }))]}
        onChange={(file) => {
          const t = tracks.find((x) => x.file === file);
          if (t) useEditorStore.getState().add({ kind: "music", mood: t.mood, file: t.file, title: t.title });
        }}
      />
    </Field>
  );
}
