"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Copy, Maximize2, Scissors, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ItemRef, Project } from "@/lib/editor/project";
import {
  clipRanges,
  itemSpan,
  moveItem,
  projectDuration,
  snap,
  snapSpan,
  snapTargets,
  trimClip,
  trimItem,
} from "@/lib/editor/ops";
import { fitZoom, inRange, scrollForZoom, tickLabel, ticks, tickStep, visibleRange } from "@/lib/editor/timeline";
import { useEditorStore } from "@/lib/editor/store";
import { useThumbnails } from "@/hooks/useThumbnails";
import { PEAKS_PER_SECOND, useWaveform } from "@/hooks/useWaveform";
import { Button } from "@/components/ui/button";
import type { Asset } from "@/lib/editor/add";
import { ASSET_MIME } from "./controls";

const LABEL_W = 84;
const RULER_H = 26;
/** Pixels within which an edge snaps. */
const SNAP_PX = 8;
const EDGE_PX = 7;

type Lane = "texts" | "stickers" | "clips" | "captions" | "sfx" | "music";
const LANES: { key: Lane; label: string; height: number; color: string }[] = [
  { key: "texts", label: "Text", height: 28, color: "bg-violet-500/80 border-violet-300" },
  { key: "stickers", label: "Stickers", height: 28, color: "bg-amber-500/80 border-amber-200" },
  { key: "clips", label: "Video", height: 58, color: "bg-sky-900 border-sky-300" },
  { key: "captions", label: "Captions", height: 26, color: "bg-emerald-600/80 border-emerald-200" },
  { key: "sfx", label: "SFX", height: 28, color: "bg-rose-500/80 border-rose-200" },
  { key: "music", label: "Music", height: 34, color: "bg-teal-600/80 border-teal-200" },
];

export function Timeline({ source, customMusic }: { source: File; customMusic: File | null }) {
  const project = useEditorStore((s) => s.project);
  const selection = useEditorStore((s) => s.selection);
  const pps = useEditorStore((s) => s.pxPerSecond);
  const scroller = useRef<HTMLDivElement>(null);
  const playheadEl = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [view, setView] = useState({ left: 0, width: 800 });

  const D = project ? projectDuration(project) : 0;
  const range = visibleRange(view.left, view.width, pps);

  // Fit the whole edit on first open.
  const fitted = useRef(false);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !project || fitted.current) return;
    fitted.current = true;
    useEditorStore.getState().setZoom(fitZoom(D, el.clientWidth));
  }, [D, project]);

  // Track the visible window (throttled to animation frames).
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setView({ left: el.scrollLeft, width: el.clientWidth }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  // Playhead: moved directly (no React render per frame) and kept in view.
  useEffect(() => {
    const place = (t: number, px: number) => {
      const el = playheadEl.current;
      const sc = scroller.current;
      if (!el || !sc) return;
      const x = t * px;
      el.style.transform = `translateX(${x}px)`;
      if (!dragging.current && (x < sc.scrollLeft || x > sc.scrollLeft + sc.clientWidth - 30)) {
        sc.scrollLeft = Math.max(0, x - sc.clientWidth * 0.2);
      }
    };
    const s = useEditorStore.getState();
    place(s.playhead, s.pxPerSecond);
    return useEditorStore.subscribe((st, prev) => {
      if (st.playhead !== prev.playhead || st.pxPerSecond !== prev.pxPerSecond) place(st.playhead, st.pxPerSecond);
    });
  }, []);

  // Shortcuts: S split, Delete remove, Ctrl/Cmd+D duplicate.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const st = useEditorStore.getState();
      if (e.key.toLowerCase() === "s" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        st.splitAtPlayhead();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        st.deleteSelected();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        st.duplicateSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const zoomTo = useCallback((next: number, anchorScreenX?: number) => {
    const sc = scroller.current;
    const st = useEditorStore.getState();
    if (!sc) return;
    const x = anchorScreenX ?? sc.clientWidth / 2;
    const anchor = (sc.scrollLeft + x) / st.pxPerSecond;
    st.setZoom(next);
    const applied = useEditorStore.getState().pxPerSecond;
    requestAnimationFrame(() => (sc.scrollLeft = scrollForZoom(anchor, x, applied)));
  }, []);

  // Ctrl/Cmd + wheel zooms around the cursor.
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = sc.getBoundingClientRect();
      const st = useEditorStore.getState();
      zoomTo(st.pxPerSecond * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX - rect.left);
    };
    sc.addEventListener("wheel", onWheel, { passive: false });
    return () => sc.removeEventListener("wheel", onWheel);
  }, [zoomTo]);

  /** Seek by clicking/dragging on the ruler or an empty part of a track. */
  const startSeek = (e: React.PointerEvent) => {
    const sc = scroller.current;
    if (!sc) return;
    const st = useEditorStore.getState();
    if (e.target === e.currentTarget) st.select(null);
    const toTime = (clientX: number) => (clientX - sc.getBoundingClientRect().left + sc.scrollLeft) / st.pxPerSecond;
    st.setPlayhead(toTime(e.clientX));
    dragging.current = true;
    const move = (ev: PointerEvent) => useEditorStore.getState().setPlayhead(toTime(ev.clientX));
    const up = () => {
      dragging.current = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /**
   * Drag an item: move it, or trim one edge. Each move recomputes from the
   * project as it was when the drag started; the whole drag is one undo step.
   */
  const startDrag = useCallback((e: React.PointerEvent, ref: ItemRef, mode: "move" | "start" | "end") => {
    e.stopPropagation();
    e.preventDefault();
    const st = useEditorStore.getState();
    st.select(ref);
    const snapshot = st.project;
    if (!snapshot) return;
    const span0 = itemSpan(snapshot, ref);
    if (!span0) return;
    const clip0 = ref.track === "clips" ? snapshot.clips.find((c) => c.id === ref.id) : undefined;
    if (ref.track === "clips" && mode === "move") return; // clips stay in source order
    const px = st.pxPerSecond;
    const threshold = SNAP_PX / px;
    const targets = snapTargets(snapshot, st.playhead, ref);
    const x0 = e.clientX;
    let started = false;

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      if (!started) {
        if (Math.abs(dx) < 3) return;
        started = true;
        dragging.current = true;
        useEditorStore.getState().beginGesture();
      }
      const dt = dx / px;
      const apply = useEditorStore.getState().apply;
      if (clip0) {
        if (mode === "end") {
          const end = snap(span0.end + dt, targets, threshold);
          apply(() => trimClip(snapshot, ref.id, "out", clip0.sourceOut + (end - span0.end)));
        } else {
          const start = snap(span0.start + dt, targets, threshold);
          apply(() => trimClip(snapshot, ref.id, "in", clip0.sourceIn + (start - span0.start)));
        }
      } else if (mode === "move") {
        const start = snapSpan(span0.start + dt, span0.end - span0.start, targets, threshold);
        apply(() => moveItem(snapshot, ref, start));
      } else {
        const edge = mode === "start" ? span0.start : span0.end;
        apply(() => trimItem(snapshot, ref, mode, snap(edge + dt, targets, threshold)));
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (started) useEditorStore.getState().endGesture();
      dragging.current = false;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, []);

  if (!project) return null;
  const width = D * pps + 240;
  const isSel = (track: string, id: string) => selection?.track === track && selection.id === id;

  return (
    <div className="flex h-full min-h-0 flex-col select-none">
      <div className="flex items-center gap-1 border-b px-2 py-1">
        <Button variant="ghost" size="sm" onClick={() => useEditorStore.getState().splitAtPlayhead()} title="Split (S)">
          <Scissors /> Split
        </Button>
        <Button variant="ghost" size="sm" disabled={!selection} onClick={() => useEditorStore.getState().deleteSelected()} title="Delete (Del)">
          <Trash2 /> Delete
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!selection || selection.track === "clips" || selection.track === "captions" || selection.track === "transitions"}
          onClick={() => useEditorStore.getState().duplicateSelected()}
          title="Duplicate (Ctrl+D)"
        >
          <Copy /> Duplicate
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="icon-sm" onClick={() => zoomTo(pps / 1.25)} aria-label="Zoom out">
          <ZoomOut />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => zoomTo(pps * 1.25)} aria-label="Zoom in">
          <ZoomIn />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => scroller.current && zoomTo(fitZoom(D, scroller.current.clientWidth), 0)}
          aria-label="Fit timeline"
          title="Fit"
        >
          <Maximize2 />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="shrink-0 border-r bg-background" style={{ width: LABEL_W }}>
          <div style={{ height: RULER_H }} />
          {LANES.map((l) => (
            <div key={l.key} className="flex items-center px-2 text-xs text-muted-foreground" style={{ height: l.height + 6 }}>
              {l.label}
            </div>
          ))}
        </div>

        <div
          ref={scroller}
          className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(ASSET_MIME)) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }
          }}
          onDrop={(e) => {
            const raw = e.dataTransfer.getData(ASSET_MIME);
            const sc = scroller.current;
            if (!raw || !sc) return;
            e.preventDefault();
            // Drop at the time under the cursor.
            const at = (e.clientX - sc.getBoundingClientRect().left + sc.scrollLeft) / pps;
            useEditorStore.getState().add(JSON.parse(raw) as Asset, Math.max(0, at));
          }}
        >
          <div className="relative" style={{ width }}>
            <Ruler pps={pps} range={range} duration={D} onPointerDown={startSeek} />
            {LANES.map((l) => (
              <div
                key={l.key}
                className="relative border-b border-border/40"
                style={{ height: l.height + 6 }}
                onPointerDown={startSeek}
              >
                <div className="pointer-events-none absolute top-0 bottom-0 left-0 bg-muted/20" style={{ width: D * pps }} />
                <LaneItems
                  lane={l}
                  project={project}
                  pps={pps}
                  range={range}
                  isSel={isSel}
                  startDrag={startDrag}
                  source={source}
                  customMusic={customMusic}
                />
              </div>
            ))}
            <div
              ref={playheadEl}
              className="pointer-events-none absolute top-0 bottom-0 left-0 z-20 w-px bg-primary"
              style={{ willChange: "transform" }}
            >
              <div className="absolute -top-0 -left-[5px] h-0 w-0 border-x-[5px] border-t-[8px] border-x-transparent border-t-primary" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Canvas ruler: draws only the visible ticks. */
const Ruler = memo(function Ruler({
  pps,
  range,
  duration,
  onPointerDown,
}: {
  pps: number;
  range: { from: number; to: number };
  duration: number;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const from = range.from;
  const to = Math.min(range.to, duration + 4);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, (to - from) * pps);
    c.width = Math.round(w * dpr);
    c.height = RULER_H * dpr;
    c.style.width = `${w}px`;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, RULER_H);
    const step = tickStep(pps);
    ctx.fillStyle = getComputedStyle(c).color;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.font = "10px ui-monospace, monospace";
    for (const t of ticks(from, to, step)) {
      const x = (t - from) * pps;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(x, RULER_H - 8, 1, 8);
      ctx.globalAlpha = 0.9;
      ctx.fillText(tickLabel(t, step), x + 3, 11);
      for (let k = 1; k < 4; k++) {
        ctx.globalAlpha = 0.3;
        ctx.fillRect(x + (k * step * pps) / 4, RULER_H - 4, 1, 4);
      }
    }
  }, [from, to, pps]);
  return (
    <div
      className="sticky top-0 z-10 cursor-pointer border-b bg-background text-muted-foreground"
      style={{ height: RULER_H }}
      onPointerDown={onPointerDown}
    >
      <canvas ref={ref} className="pointer-events-none absolute top-0" style={{ left: from * pps, height: RULER_H }} />
    </div>
  );
});

interface LaneProps {
  lane: (typeof LANES)[number];
  project: Project;
  pps: number;
  range: { from: number; to: number };
  isSel: (track: string, id: string) => boolean;
  startDrag: (e: React.PointerEvent, ref: ItemRef, mode: "move" | "start" | "end") => void;
  source: File;
  customMusic: File | null;
}

function LaneItems({ lane, project, pps, range, isSel, startDrag, source, customMusic }: LaneProps) {
  const h = lane.height;
  switch (lane.key) {
    case "texts":
      return (
        <>
          {project.texts.filter((t) => inRange(t.start, t.end, range)).map((t) => (
            <Block key={t.id} start={t.start} end={t.end} pps={pps} h={h} color={lane.color} selected={isSel("texts", t.id)}
              onDrag={(e, m) => startDrag(e, { track: "texts", id: t.id }, m)} trim>
              <span className="truncate px-1.5 text-[11px] font-medium text-white">{t.label ? `${t.label}: ` : ""}{t.text}</span>
            </Block>
          ))}
        </>
      );
    case "stickers":
      return (
        <>
          {project.stickers.filter((s) => inRange(s.start, s.end, range)).map((s) => (
            <Block key={s.id} start={s.start} end={s.end} pps={pps} h={h} color={lane.color} selected={isSel("stickers", s.id)}
              onDrag={(e, m) => startDrag(e, { track: "stickers", id: s.id }, m)} trim>
              <span className="px-1 text-base leading-none">{s.emoji}</span>
            </Block>
          ))}
        </>
      );
    case "captions":
      return (
        <>
          {project.captions.groups.filter((g) => inRange(g.start, g.end, range)).map((g) => (
            <Block key={g.id} start={g.start} end={g.end} pps={pps} h={h}
              color={cn(lane.color, !project.captions.enabled && "opacity-40")} selected={isSel("captions", g.id)}
              onDrag={(e, m) => startDrag(e, { track: "captions", id: g.id }, m)} trim>
              <span className="truncate px-1 text-[10px] text-white">{g.words.map((w) => w.text).join(" ")}</span>
            </Block>
          ))}
        </>
      );
    case "sfx":
      return (
        <>
          {project.sfx.filter((s) => inRange(s.start, s.start + s.duration, range)).map((s) => (
            <Block key={s.id} start={s.start} end={s.start + Math.max(s.duration, 0.12)} pps={pps} h={h} color={lane.color}
              selected={isSel("sfx", s.id)} onDrag={(e, m) => startDrag(e, { track: "sfx", id: s.id }, m)}>
              <Waveform src={{ url: `/sfx/${s.sound}.ogg` }} width={Math.max(s.duration, 0.12) * pps} height={h} offset={0} length={s.duration} loop={false} />
              <span className="relative truncate px-1 text-[10px] text-white">{s.sound}</span>
            </Block>
          ))}
        </>
      );
    case "music":
      return (
        <>
          {project.music.filter((m) => inRange(m.start, m.end, range)).map((m) => {
            const src =
              m.source.kind === "custom"
                ? customMusic ? { file: customMusic } : null
                : m.source.file ? { url: `/music/${m.source.file}` } : null;
            const name = m.source.kind === "custom" ? m.source.name : (m.source.title ?? `${m.source.mood} music`);
            return (
              <Block key={m.id} start={m.start} end={m.end} pps={pps} h={h} color={lane.color} selected={isSel("music", m.id)}
                onDrag={(e, mode) => startDrag(e, { track: "music", id: m.id }, mode)} trim>
                <Waveform src={src} width={(m.end - m.start) * pps} height={h} offset={0} length={m.end - m.start} loop />
                <span className="relative truncate px-1.5 text-[11px] text-white">♪ {name}</span>
              </Block>
            );
          })}
        </>
      );
    case "clips":
      return <VideoLane project={project} pps={pps} range={range} isSel={isSel} startDrag={startDrag} source={source} h={h} />;
  }
}

/** A timeline item: drag to move, drag an edge to trim. */
function Block({
  start,
  end,
  pps,
  h,
  color,
  selected,
  onDrag,
  trim,
  top = 3,
  children,
}: {
  top?: number;
  start: number;
  end: number;
  pps: number;
  h: number;
  color: string;
  selected: boolean;
  onDrag: (e: React.PointerEvent, mode: "move" | "start" | "end") => void;
  trim?: boolean;
  children: React.ReactNode;
}) {
  const w = Math.max(4, (end - start) * pps);
  return (
    <div
      className={cn(
        "absolute flex cursor-grab items-center overflow-hidden rounded-md border active:cursor-grabbing",
        color,
        selected ? "z-10 ring-2 ring-white" : "border-transparent",
      )}
      style={{ left: start * pps, width: w, height: h, top }}
      onPointerDown={(e) => onDrag(e, "move")}
    >
      {children}
      {trim && w > 14 && (
        <>
          <span className="absolute inset-y-0 left-0 cursor-ew-resize hover:bg-white/40" style={{ width: EDGE_PX }} onPointerDown={(e) => onDrag(e, "start")} />
          <span className="absolute inset-y-0 right-0 cursor-ew-resize hover:bg-white/40" style={{ width: EDGE_PX }} onPointerDown={(e) => onDrag(e, "end")} />
        </>
      )}
    </div>
  );
}

/** Video track: clip thumbnails, trim handles, and zoom/transition bars on top. */
function VideoLane({
  project,
  pps,
  range,
  isSel,
  startDrag,
  source,
  h,
}: Omit<LaneProps, "lane" | "customMusic"> & { h: number }) {
  const vertical = project.settings.vertical;
  const info = project.info;
  const sideways = Math.abs(info.rotation ?? 0) % 180 === 90;
  const aspect = vertical ? 9 / 16 : sideways ? info.height / info.width : info.width / info.height;
  const thumbH = h - 14;
  const { get } = useThumbnails(source, aspect, thumbH);
  const tileW = Math.max(16, Math.round(thumbH * aspect));

  return (
    <>
      {clipRanges(project.clips).filter((c) => inRange(c.start, c.end, range)).map((c) => {
        const tiles: { x: number; t: number }[] = [];
        const first = Math.max(c.start, range.from);
        const startX = Math.floor(((first - c.start) * pps) / tileW) * tileW;
        for (let x = startX; x < (c.end - c.start) * pps && c.start + x / pps <= range.to; x += tileW) {
          tiles.push({ x, t: c.sourceIn + x / pps });
        }
        const sel = isSel("clips", c.id);
        return (
          <div
            key={c.id}
            className={cn("absolute bottom-[3px] overflow-hidden rounded-md border bg-sky-950", sel ? "z-10 border-white ring-2 ring-white" : "border-sky-700")}
            style={{ left: c.start * pps, width: Math.max(4, (c.end - c.start) * pps), height: thumbH }}
            onPointerDown={(e) => startDrag(e, { track: "clips", id: c.id }, "move")}
          >
            {tiles.map((tile) => {
              const url = get(tile.t);
              return url ? (
                // Data-URL thumbnails: next/image doesn't apply.
                // eslint-disable-next-line @next/next/no-img-element
                <img key={tile.x} src={url} alt="" draggable={false} className="pointer-events-none absolute top-0 h-full max-w-none"
                  style={{ left: tile.x, width: tileW }} />
              ) : null;
            })}
            <span className="absolute inset-y-0 left-0 z-10 cursor-ew-resize bg-white/0 hover:bg-white/40" style={{ width: EDGE_PX }}
              onPointerDown={(e) => startDrag(e, { track: "clips", id: c.id }, "start")} />
            <span className="absolute inset-y-0 right-0 z-10 cursor-ew-resize bg-white/0 hover:bg-white/40" style={{ width: EDGE_PX }}
              onPointerDown={(e) => startDrag(e, { track: "clips", id: c.id }, "end")} />
          </div>
        );
      })}
      {/* Zooms and transitions sit in a thin strip above the clips. */}
      {project.zooms.filter((z) => inRange(z.start, z.end, range)).map((z) => (
        <Block key={z.id} start={z.start} end={z.end} pps={pps} h={9} top={2} color="bg-fuchsia-500 border-fuchsia-200"
          selected={isSel("zooms", z.id)} onDrag={(e, m) => startDrag(e, { track: "zooms", id: z.id }, m)} trim>
          <span />
        </Block>
      ))}
      {project.transitions.filter((t) => inRange(t.at, t.at, range)).map((t) => (
        <div key={t.id} title="Flash transition"
          className={cn("absolute top-0.5 z-10 h-[9px] w-[9px] -translate-x-1/2 rotate-45 cursor-grab bg-white", isSel("transitions", t.id) && "ring-2 ring-primary")}
          style={{ left: t.at * pps }}
          onPointerDown={(e) => startDrag(e, { track: "transitions", id: t.id }, "move")} />
      ))}
    </>
  );
}

/** Waveform drawn from cached peaks; music loops its file across the item. */
const Waveform = memo(function Waveform({
  src,
  width,
  height,
  offset,
  length,
  loop,
}: {
  src: { url: string } | { file: File } | null;
  width: number;
  height: number;
  offset: number;
  length: number;
  loop: boolean;
}) {
  const peaks = useWaveform(src);
  const ref = useRef<HTMLCanvasElement>(null);
  const w = Math.min(4096, Math.max(1, Math.round(width)));
  useEffect(() => {
    const c = ref.current;
    if (!c || !peaks || !peaks.length) return;
    c.width = w;
    c.height = height;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, w, height);
    ctx.fillStyle = "rgba(255,255,255,.45)";
    const mid = height / 2;
    for (let x = 0; x < w; x++) {
      const t = offset + (x / w) * length;
      let i = Math.floor(t * PEAKS_PER_SECOND);
      if (loop) i %= peaks.length;
      if (i >= peaks.length) break;
      const a = Math.min(1, peaks[i] * 1.4) * (mid - 2);
      ctx.fillRect(x, mid - a, 1, Math.max(1, a * 2));
    }
  }, [height, length, loop, offset, peaks, w]);
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full" style={{ width }} />;
});
