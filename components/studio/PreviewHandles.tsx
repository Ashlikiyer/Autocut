"use client";

import { cn } from "@/lib/utils";
import type { Composition } from "@/lib/engine/compose";
import { updateItem } from "@/lib/editor/ops";
import type { ItemRef } from "@/lib/editor/project";
import { cardStateAt, stickerStateAt } from "@/lib/editor/preview";
import { useEditorStore } from "@/lib/editor/store";
import { cardBox, cardKey, type CardImages } from "./PreviewPlayer";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Drag handles over the preview: click to select a text or sticker, drag to
 * move it, drag the corner to resize (stickers and plain text). Each drag is a
 * single undo step.
 */
export function PreviewHandles({
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
  const selection = useEditorStore((s) => s.selection);
  const short = Math.min(frame.w, frame.h);
  if (!frame.w) return null;

  /** Starts a move or resize drag; `update` maps the pointer delta to new properties. */
  const drag = (
    e: React.PointerEvent,
    ref: ItemRef,
    update: (dx: number, dy: number) => Record<string, number>,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const st = useEditorStore.getState();
    st.select(ref);
    const snapshot = st.project;
    if (!snapshot) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let started = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      if (!started) {
        if (Math.abs(dx) + Math.abs(dy) < 3) return;
        started = true;
        useEditorStore.getState().beginGesture();
      }
      useEditorStore.getState().apply(() => updateItem(snapshot, ref, update(dx, dy)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (started) useEditorStore.getState().endGesture();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const project = useEditorStore.getState().project;

  return (
    <div className="pointer-events-none absolute inset-0">
      {comp.cards.map((c) => {
        if (!c.id) return null;
        const img = images[cardKey(comp, c)];
        if (!img || !cardStateAt(c, t).visible) return null;
        const box = cardBox(c, img, frame);
        const ref: ItemRef = { track: "texts", id: c.id };
        const selected = selection?.track === "texts" && selection.id === c.id;
        const width = frame.w * 0.84;
        const item = project?.texts.find((x) => x.id === c.id);
        return (
          <div
            key={c.id}
            className={cn(
              "pointer-events-auto absolute cursor-move rounded-md border-2",
              selected ? "border-dashed border-white/90" : "border-transparent hover:border-white/40",
            )}
            style={{ left: box.cx - width / 2, top: box.top, width, height: box.h }}
            onPointerDown={(e) => {
              const x0 = c.x ?? 0.5;
              const top0 = box.top / frame.h;
              drag(e, ref, (dx, dy) => ({
                x: clamp(x0 + dx / frame.w, 0, 1),
                y: clamp(top0 + dy / frame.h, -0.2, 1),
              }));
            }}
          >
            {selected && c.kind === "text" && item && (
              <span
                className="absolute -right-1.5 -bottom-1.5 size-3.5 cursor-nwse-resize rounded-sm border border-black bg-white"
                onPointerDown={(e) =>
                  drag(e, ref, (_dx, dy) => ({ size: clamp(item.size * (1 + dy / Math.max(20, box.h)), 0.03, 0.2) }))
                }
              />
            )}
          </div>
        );
      })}

      {comp.emojis.map((em) => {
        if (!em.id || !stickerStateAt(em, t).visible) return null;
        const size = (em.size ?? 0.2) * short;
        const cx = frame.w * (em.x ?? 0.5);
        const cy = frame.h * (em.y ?? 0.32);
        const ref: ItemRef = { track: "stickers", id: em.id };
        const selected = selection?.track === "stickers" && selection.id === em.id;
        return (
          <div
            key={em.id}
            className={cn(
              "pointer-events-auto absolute cursor-move rounded-md border-2",
              selected ? "border-dashed border-white/90" : "border-transparent hover:border-white/40",
            )}
            style={{ left: cx - size / 2, top: cy - size / 2, width: size, height: size }}
            onPointerDown={(e) => {
              const x0 = em.x ?? 0.5;
              const y0 = em.y ?? 0.32;
              drag(e, ref, (dx, dy) => ({ x: clamp(x0 + dx / frame.w, 0, 1), y: clamp(y0 + dy / frame.h, 0, 1) }));
            }}
          >
            {selected && (
              <span
                className="absolute -right-1.5 -bottom-1.5 size-3.5 cursor-nwse-resize rounded-sm border border-black bg-white"
                onPointerDown={(e) => {
                  const s0 = em.size ?? 0.2;
                  drag(e, ref, (dx, dy) => ({ size: clamp(s0 * (1 + (dx + dy) / 2 / size), 0.06, 0.5) }));
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
