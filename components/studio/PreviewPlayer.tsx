"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { CaptionStyle } from "@/lib/presets";
import type { CompCard, Composition } from "@/lib/engine/compose";
import { drawCard, FONT_CSS } from "@/lib/engine/cards";
import { CARD_TOP, FINAL_QUALITY, outputSize } from "@/lib/engine/filtergraph";
import { projectToComposition } from "@/lib/editor/convert";
import { projectDuration } from "@/lib/editor/ops";
import {
  captionAt,
  cardStateAt,
  flashAt,
  focusAt,
  formatTimecode,
  shakeAt,
  stickerStateAt,
  zoomAt,
} from "@/lib/editor/preview";
import { useEditorStore } from "@/lib/editor/store";
import { wordPopAt } from "@/lib/engine/ass";
import { usePreviewPlayback } from "@/hooks/usePreviewPlayback";
import { PreviewHandles } from "./PreviewHandles";
import { Button } from "@/components/ui/button";

/**
 * Plays the project without rendering. It uses the same adapter, card images
 * and timing math as the export, so the preview matches the downloaded file.
 */
export function PreviewPlayer({ source, customMusic }: { source: File; customMusic: File | null }) {
  const project = useEditorStore((s) => s.project);
  const playhead = useEditorStore((s) => s.playhead);
  const comp = useMemo(() => (project ? projectToComposition(project) : null), [project]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const { playing, toggle } = usePreviewPlayback(videoRef, project, comp, customMusic);
  const images = useCardImages(comp);

  // Space: play/pause (not while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.code !== "Space" || (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable))) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const ready = project !== null;
  // The URL is created, assigned and revoked inside one effect, so React's
  // double-mount in development can't revoke a URL the <video> still uses.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const url = URL.createObjectURL(source);
    video.src = url;
    return () => {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };
    // Re-run once the project has loaded and the <video> exists.
  }, [source, ready]);

  // Output shape (9:16 when cropping, else the video's own shape).
  const [outW, outH] = project ? outputSize(project.info, FINAL_QUALITY, project.settings.vertical) : [9, 16];

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setFrame({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!project || !comp) return null;
  const D = projectDuration(project);
  const t = playhead;
  const z = zoomAt(comp, t);
  const shake = shakeAt(comp, t);
  const short = Math.min(frame.w, frame.h);
  const focused = focusAt(comp, t);
  const filters = [
    comp.colorBoost ? "saturate(1.3) contrast(1.06)" : "",
    focused ? `blur(${Math.max(2, short * 0.025)}px) brightness(0.88) saturate(0.75)` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex h-full min-h-0 flex-col items-center gap-3">
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <div
          ref={frameRef}
          className="relative h-full max-h-full overflow-hidden rounded-lg bg-black shadow-lg"
          style={{ aspectRatio: `${outW} / ${outH}` }}
        >
          <div
            className="absolute inset-0"
            style={{
              transform: `translate(${shake.x * short}px, ${shake.y * short}px) scale(${z})`,
              filter: filters || undefined,
            }}
          >
            <video
              ref={videoRef}
              playsInline
              preload="auto"
              className="h-full w-full object-cover"
            />
          </div>
          {project.settings.vignette && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.45) 100%)" }}
            />
          )}
          <div className="pointer-events-none absolute inset-0 bg-white" style={{ opacity: flashAt(comp, t) }} />

          <CardLayer comp={comp} images={images} t={t} frame={frame} />
          <StickerLayer comp={comp} t={t} frame={frame} />
          {comp.caption && (
            <CaptionLayer
              groups={comp.captionGroups ?? []}
              style={comp.caption}
              hidden={comp.cards.filter((c) => c.kind === "focus")}
              t={t}
              frame={frame}
              outH={outH}
            />
          )}
          {comp.progressBar && (
            <div
              className="absolute bottom-0 left-0"
              style={{ height: Math.max(3, frame.h * 0.007), width: `${(t / Math.max(D, 0.1)) * 100}%`, background: comp.accent, opacity: 0.9 }}
            />
          )}
          <PreviewHandles comp={comp} images={images} t={t} frame={frame} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button size="icon-lg" variant="secondary" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
          {playing ? <Pause /> : <Play />}
        </Button>
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {formatTimecode(t)} / {formatTimecode(D)}
        </span>
      </div>
    </div>
  );
}

/** Same images the export overlays, positioned and animated the same way. */
const CardLayer = memo(function CardLayer({
  comp,
  images,
  t,
  frame,
}: {
  comp: Composition;
  images: CardImages;
  t: number;
  frame: { w: number; h: number };
}) {
  return (
    <>
      {comp.cards.map((c, i) => {
        const img = images[cardKey(comp, c)];
        const st = cardStateAt(c, t);
        if (!img || !st.visible) return null;
        const { top } = cardBox(c, img, frame);
        return (
          // Local blob images: next/image doesn't apply.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={img.url}
            alt=""
            draggable={false}
            className="pointer-events-none absolute max-w-none select-none"
            style={{
              width: frame.w,
              left: frame.w * (c.x ?? 0.5) - frame.w / 2,
              top: top + st.dy * frame.h,
              opacity: st.opacity,
            }}
          />
        );
      })}
    </>
  );
});

export type CardImages = Record<string, { url: string; height: number }>;

/**
 * Where a card sits in the preview frame (same rule as the export's CARD_TOP):
 * centre x, top edge and height in pixels.
 */
export function cardBox(c: CompCard, img: { height: number }, frame: { w: number; h: number }) {
  // The card image is 1080 px wide, scaled to the frame width.
  const h = img.height * (frame.w / 1080);
  const topFrac = c.y ?? CARD_TOP[c.kind];
  const top = topFrac < 0 ? (frame.h - h) / 2 - frame.h * 0.04 : frame.h * topFrac;
  return { cx: frame.w * (c.x ?? 0.5), top, h };
}

export function cardKey(comp: Composition, c: CompCard) {
  return JSON.stringify([c.kind, c.text, c.label, c.accent, c.sticker, c.style, c.font, c.size, c.color, comp.theme]);
}

/** Draws each card once with the export's canvas code and caches it by content. */
function useCardImages(comp: Composition | null) {
  const [images, setImages] = useState<CardImages>({});
  const cache = useRef(images);
  useEffect(() => {
    if (!comp) return;
    let alive = true;
    (async () => {
      const next = { ...cache.current };
      let changed = false;
      for (const c of comp.cards) {
        const key = cardKey(comp, c);
        if (next[key]) continue;
        try {
          const png = await drawCard(c, comp.theme);
          const blob = new Blob([png as Uint8Array<ArrayBuffer>], { type: "image/png" });
          const bitmap = await createImageBitmap(blob);
          next[key] = { url: URL.createObjectURL(blob), height: bitmap.height };
          bitmap.close();
          changed = true;
        } catch (err) {
          console.warn("[preview] card failed", err);
        }
      }
      if (alive && changed) {
        cache.current = next;
        setImages(next);
      }
    })();
    return () => {
      alive = false;
    };
  }, [comp]);
  useEffect(() => () => Object.values(cache.current).forEach((i) => URL.revokeObjectURL(i.url)), []);
  return images;
}

const StickerLayer = memo(function StickerLayer({
  comp,
  t,
  frame,
}: {
  comp: Composition;
  t: number;
  frame: { w: number; h: number };
}) {
  const short = Math.min(frame.w, frame.h);
  return (
    <>
      {comp.emojis.map((e, i) => {
        const st = stickerStateAt(e, t);
        if (!st.visible) return null;
        const size = (e.size ?? 0.2) * short;
        return (
          <span
            key={i}
            className="pointer-events-none absolute select-none text-center leading-none"
            style={{
              fontSize: size * 0.8,
              width: size,
              height: size,
              lineHeight: `${size}px`,
              left: frame.w * (e.x ?? 0.5) - size / 2,
              top: frame.h * ((e.y ?? 0.32) + st.dy) - size / 2,
              fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif',
            }}
          >
            {e.emoji}
          </span>
        );
      })}
    </>
  );
});

/** Captions styled from the same preset as the subtitle export. */
function CaptionLayer({
  groups,
  style: c,
  hidden,
  t,
  frame,
  outH,
}: {
  groups: import("@/types").Word[][];
  style: CaptionStyle;
  hidden: { start: number; end: number }[];
  t: number;
  frame: { w: number; h: number };
  outH: number;
}) {
  const now = captionAt(groups, t, hidden);
  if (!now || !frame.h) return null;
  const short = Math.min(frame.w, frame.h);
  const fs = short * c.size;
  const k = frame.h / outH; // subtitle pixels → preview pixels
  const font = FONT_CSS[c.font] ?? FONT_CSS["Poppins Black"];
  const text = (w: string) => (c.uppercase ? w.toUpperCase() : w);
  return (
    <div
      className="pointer-events-none absolute right-0 left-0 text-center"
      style={{ bottom: frame.h * c.marginBottom, padding: `0 ${frame.w * 0.06}px` }}
    >
      <span
        style={{
          fontFamily: font.family,
          fontWeight: font.weight,
          fontSize: fs,
          lineHeight: 1.2,
          color: c.color,
          // A CSS stroke is centred on the outline (half is painted over by
          // the fill), while libass's border is all outside: double it to match.
          WebkitTextStroke: `${Math.max(1, 2 * fs * c.outlineWidth)}px ${c.outline}`,
          paintOrder: "stroke fill",
          textShadow: c.shadow ? `0 ${c.shadow * k}px 0 rgba(0,0,0,.5)` : undefined,
        }}
      >
        {now.words.map((w, i) => {
          // Same reveal as the subtitle file: words appear as they're said
          // (fade + pop); words not said yet keep their space but are hidden.
          const saying = i === now.active;
          const pop = saying ? wordPopAt(t - w.start, w.emphasis) : null;
          const scale = pop ? pop.scale : w.emphasis ? 1.1 : 1;
          return (
            <span key={i}>
              <span
                style={{
                  display: "inline-block",
                  transform: `scale(${scale})`,
                  opacity: i > now.active ? 0 : (pop?.opacity ?? 1),
                  color: (saying && c.wordHighlight) || w.emphasis ? c.highlight : undefined,
                }}
              >
                {text(w.word)}
              </span>
              {i < now.words.length - 1 ? " " : ""}
            </span>
          );
        })}
      </span>
    </div>
  );
}
