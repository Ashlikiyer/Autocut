import {
  SPAN_TRACKS,
  uid,
  type CaptionGroup,
  type Clip,
  type ItemRef,
  type Project,
  type SpanTrack,
} from "./project";

/**
 * Pure editing functions. Every function returns a new Project and never
 * mutates its input, so they work directly with undo/redo.
 */

/** Shortest clip or overlay the editor allows (seconds). */
export const MIN_LENGTH = 0.1;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

// ---------------------------------------------------------------- timing

export interface ClipRange extends Clip {
  /** Output-time span of the clip. */
  start: number;
  end: number;
}

/** Output-time span of each clip (clips play back to back). */
export function clipRanges(clips: Clip[]): ClipRange[] {
  let t = 0;
  return clips.map((c) => {
    const len = c.sourceOut - c.sourceIn;
    const r = { ...c, start: r3(t), end: r3(t + len) };
    t += len;
    return r;
  });
}

/** Length of the edited video. */
export function projectDuration(p: Pick<Project, "clips">): number {
  return r3(p.clips.reduce((s, c) => s + (c.sourceOut - c.sourceIn), 0));
}

/** The clip under an output time (the later clip at an exact boundary). */
export function clipAt(clips: Clip[], t: number): ClipRange | null {
  const ranges = clipRanges(clips);
  for (let i = ranges.length - 1; i >= 0; i--) {
    if (t >= ranges[i].start && t < ranges[i].end) return ranges[i];
  }
  const last = ranges[ranges.length - 1];
  return last && t === last.end ? last : null;
}

/** Output time → source time (for seeking the <video>). */
export function outputToSource(clips: Clip[], t: number): number | null {
  const c = clipAt(clips, t);
  return c ? r3(c.sourceIn + (t - c.start)) : null;
}

/** Source time → output time, or null if that moment was cut. */
export function sourceToOutput(clips: Clip[], s: number): number | null {
  for (const c of clipRanges(clips)) {
    if (s >= c.sourceIn && s <= c.sourceOut) return r3(c.start + (s - c.sourceIn));
  }
  return null;
}

// ---------------------------------------------------------------- ripple

interface Span {
  start: number;
  end: number;
}

/** Removes [at, at+len) from a span; returns null when nothing is left. */
function removeFromSpan<T extends Span>(item: T, at: number, len: number): T | null {
  const cutEnd = at + len;
  if (item.end <= at) return item;
  if (item.start >= cutEnd) return { ...item, start: r3(item.start - len), end: r3(item.end - len) };
  const start = item.start < at ? item.start : at;
  const kept = Math.max(0, at - item.start) + Math.max(0, item.end - cutEnd);
  return kept >= MIN_LENGTH ? { ...item, start: r3(start), end: r3(start + kept) } : null;
}

function removeFromCaption(g: CaptionGroup, at: number, len: number): CaptionGroup | null {
  const cutEnd = at + len;
  const words = g.words
    .filter((w) => w.start < at || w.start >= cutEnd)
    .map((w) => (w.start >= cutEnd ? { ...w, start: r3(w.start - len), end: r3(w.end - len) } : w));
  if (!words.length) return null;
  return { ...g, words, start: words[0].start, end: r3(Math.max(words[words.length - 1].end, words[0].start + MIN_LENGTH)) };
}

/**
 * Removes [at, at+len) of output time from every overlay: items inside are
 * deleted, later items move left, items across the cut are shortened.
 */
export function rippleRemove(p: Project, at: number, len: number): Project {
  if (len <= 0) return p;
  const out: Project = { ...p };
  for (const track of SPAN_TRACKS) {
    (out[track] as Span[]) = (p[track] as Span[])
      .map((it) => removeFromSpan(it, at, len))
      .filter((it): it is Span => it !== null);
  }
  out.sfx = p.sfx
    .filter((s) => s.start < at || s.start >= at + len)
    .map((s) => (s.start >= at + len ? { ...s, start: r3(s.start - len) } : s));
  out.transitions = p.transitions
    .filter((tr) => tr.at <= at || tr.at >= at + len)
    .map((tr) => (tr.at >= at + len ? { ...tr, at: r3(tr.at - len) } : tr));
  out.captions = {
    ...p.captions,
    groups: p.captions.groups
      .map((g) => removeFromCaption(g, at, len))
      .filter((g): g is CaptionGroup => g !== null),
  };
  return out;
}

/** Opens a gap of `len` at output time `at`: everything starting at or after it moves right. */
export function rippleInsert(p: Project, at: number, len: number): Project {
  if (len <= 0) return p;
  const shift = <T extends Span>(it: T): T =>
    it.start >= at ? { ...it, start: r3(it.start + len), end: r3(it.end + len) } : it;
  const out: Project = { ...p };
  for (const track of SPAN_TRACKS) (out[track] as Span[]) = (p[track] as Span[]).map(shift);
  out.sfx = p.sfx.map((s) => (s.start >= at ? { ...s, start: r3(s.start + len) } : s));
  out.transitions = p.transitions.map((tr) => (tr.at > at ? { ...tr, at: r3(tr.at + len) } : tr));
  out.captions = {
    ...p.captions,
    groups: p.captions.groups.map((g) =>
      g.start >= at ? { ...shift(g), words: g.words.map((w) => shift(w)) } : g,
    ),
  };
  return out;
}

// ---------------------------------------------------------------- clips

/** Splits the clip under output time `t` into two. No-op too close to an edge. */
export function splitClip(p: Project, t: number): Project {
  const c = clipAt(p.clips, t);
  if (!c || t - c.start < MIN_LENGTH || c.end - t < MIN_LENGTH) return p;
  const cut = r3(c.sourceIn + (t - c.start));
  const i = p.clips.findIndex((x) => x.id === c.id);
  const clips = [...p.clips];
  clips.splice(i, 1, { id: c.id, sourceIn: c.sourceIn, sourceOut: cut }, { id: uid("clip"), sourceIn: cut, sourceOut: c.sourceOut });
  return { ...p, clips };
}

/** Deletes a clip; the video closes the gap and overlays on it ripple with it. */
export function deleteClip(p: Project, id: string): Project {
  const c = clipRanges(p.clips).find((x) => x.id === id);
  if (!c || p.clips.length <= 1) return p;
  return { ...rippleRemove(p, c.start, c.end - c.start), clips: p.clips.filter((x) => x.id !== id) };
}

/**
 * Moves one edge of a clip to a new SOURCE time. Clips can't overlap their
 * neighbours in the source; overlays after the edit point ripple.
 */
export function trimClip(p: Project, id: string, edge: "in" | "out", sourceTime: number): Project {
  const i = p.clips.findIndex((x) => x.id === id);
  if (i < 0) return p;
  const c = clipRanges(p.clips)[i];
  const prevOut = i > 0 ? p.clips[i - 1].sourceOut : 0;
  const nextIn = i < p.clips.length - 1 ? p.clips[i + 1].sourceIn : p.info.duration;
  const clips = [...p.clips];

  if (edge === "out") {
    const out = r3(Math.min(nextIn, Math.max(c.sourceIn + MIN_LENGTH, sourceTime)));
    const delta = out - c.sourceOut;
    clips[i] = { ...p.clips[i], sourceOut: out };
    const moved = delta < 0 ? rippleRemove(p, c.end + delta, -delta) : rippleInsert(p, c.end, delta);
    return { ...moved, clips };
  }
  const inn = r3(Math.max(prevOut, Math.min(c.sourceOut - MIN_LENGTH, sourceTime)));
  const delta = inn - c.sourceIn; // > 0 shortens the clip from the front
  clips[i] = { ...p.clips[i], sourceIn: inn };
  const moved = delta > 0 ? rippleRemove(p, c.start, delta) : rippleInsert(p, c.start, -delta);
  return { ...moved, clips };
}

// ---------------------------------------------------------------- overlays

const isSpan = (track: string): track is SpanTrack => (SPAN_TRACKS as readonly string[]).includes(track);

/** Start and end (output time) of any item, for snapping and the timeline. */
export function itemSpan(p: Project, ref: ItemRef): Span | null {
  if (isSpan(ref.track)) {
    const it = (p[ref.track] as (Span & { id: string })[]).find((x) => x.id === ref.id);
    return it ? { start: it.start, end: it.end } : null;
  }
  if (ref.track === "sfx") {
    const s = p.sfx.find((x) => x.id === ref.id);
    return s ? { start: s.start, end: s.start + s.duration } : null;
  }
  if (ref.track === "captions") {
    const g = p.captions.groups.find((x) => x.id === ref.id);
    return g ? { start: g.start, end: g.end } : null;
  }
  if (ref.track === "transitions") {
    const tr = p.transitions.find((x) => x.id === ref.id);
    return tr ? { start: tr.at, end: tr.at + 0.2 } : null;
  }
  const c = clipRanges(p.clips).find((x) => x.id === ref.id);
  return c ? { start: c.start, end: c.end } : null;
}

/** Moves an overlay so it starts at `start` (kept inside the video). */
export function moveItem(p: Project, ref: ItemRef, start: number): Project {
  const D = projectDuration(p);
  const span = itemSpan(p, ref);
  if (!span || ref.track === "clips") return p;
  const len = span.end - span.start;
  const s = r3(Math.max(0, Math.min(D - len, start)));
  const delta = s - span.start;
  if (isSpan(ref.track)) {
    return {
      ...p,
      [ref.track]: (p[ref.track] as (Span & { id: string })[]).map((it) =>
        it.id === ref.id ? { ...it, start: s, end: r3(it.end + delta) } : it,
      ),
    };
  }
  if (ref.track === "sfx") return { ...p, sfx: p.sfx.map((x) => (x.id === ref.id ? { ...x, start: s } : x)) };
  if (ref.track === "transitions") {
    return { ...p, transitions: p.transitions.map((x) => (x.id === ref.id ? { ...x, at: s } : x)) };
  }
  // Captions move with their words.
  return {
    ...p,
    captions: {
      ...p.captions,
      groups: p.captions.groups.map((g) =>
        g.id === ref.id
          ? {
              ...g,
              start: s,
              end: r3(g.end + delta),
              words: g.words.map((w) => ({ ...w, start: r3(w.start + delta), end: r3(w.end + delta) })),
            }
          : g,
      ),
    },
  };
}

/** Drags one edge of an overlay to output time `t`. */
export function trimItem(p: Project, ref: ItemRef, edge: "start" | "end", t: number): Project {
  const D = projectDuration(p);
  const span = itemSpan(p, ref);
  if (!span) return p;
  const start = edge === "start" ? r3(Math.max(0, Math.min(span.end - MIN_LENGTH, t))) : span.start;
  const end = edge === "end" ? r3(Math.min(D, Math.max(span.start + MIN_LENGTH, t))) : span.end;
  if (isSpan(ref.track)) {
    return {
      ...p,
      [ref.track]: (p[ref.track] as (Span & { id: string })[]).map((it) =>
        it.id === ref.id ? { ...it, start, end } : it,
      ),
    };
  }
  if (ref.track === "captions") {
    // Words stretch to fit the new span.
    return {
      ...p,
      captions: {
        ...p.captions,
        groups: p.captions.groups.map((g) => (g.id === ref.id ? retimeCaption(g, start, end) : g)),
      },
    };
  }
  return p;
}

function retimeCaption(g: CaptionGroup, start: number, end: number): CaptionGroup {
  const k = (end - start) / Math.max(g.end - g.start, 0.001);
  const map = (t: number) => r3(start + (t - g.start) * k);
  return { ...g, start, end, words: g.words.map((w) => ({ ...w, start: map(w.start), end: map(w.end) })) };
}

/** Splits an overlay at output time `t` into two items. */
export function splitItem(p: Project, ref: ItemRef, t: number): Project {
  if (!isSpan(ref.track)) return p;
  const list = p[ref.track] as (Span & { id: string })[];
  const it = list.find((x) => x.id === ref.id);
  if (!it || t - it.start < MIN_LENGTH || it.end - t < MIN_LENGTH) return p;
  const i = list.indexOf(it);
  const next = [...list];
  next.splice(i, 1, { ...it, end: r3(t) }, { ...it, id: uid(ref.track), start: r3(t) });
  return { ...p, [ref.track]: next };
}

/** Copies an overlay to right after itself (or as late as fits). */
export function duplicateItem(p: Project, ref: ItemRef): { project: Project; ref: ItemRef | null } {
  const span = itemSpan(p, ref);
  if (!span || ref.track === "clips" || ref.track === "captions" || ref.track === "transitions") {
    return { project: p, ref: null };
  }
  const id = uid(ref.track);
  const D = projectDuration(p);
  const len = span.end - span.start;
  const start = r3(Math.max(0, Math.min(D - len, span.end)));
  if (ref.track === "sfx") {
    const s = p.sfx.find((x) => x.id === ref.id)!;
    return { project: { ...p, sfx: [...p.sfx, { ...s, id, start }] }, ref: { track: "sfx", id } };
  }
  const list = p[ref.track] as (Span & { id: string })[];
  const it = list.find((x) => x.id === ref.id)!;
  return {
    project: { ...p, [ref.track]: [...list, { ...it, id, start, end: r3(start + len) }] },
    ref: { track: ref.track, id },
  };
}

/** Deletes any item. Deleting a clip ripples. */
export function deleteItem(p: Project, ref: ItemRef): Project {
  if (ref.track === "clips") return deleteClip(p, ref.id);
  if (ref.track === "captions") {
    return { ...p, captions: { ...p.captions, groups: p.captions.groups.filter((g) => g.id !== ref.id) } };
  }
  const list = p[ref.track] as { id: string }[];
  return { ...p, [ref.track]: list.filter((x) => x.id !== ref.id) };
}

/** Merges properties into an item (not clips or captions; see setCaptionText). */
export function updateItem<T extends object>(p: Project, ref: ItemRef, patch: Partial<T>): Project {
  if (ref.track === "clips" || ref.track === "captions") return p;
  const list = p[ref.track] as { id: string }[];
  return { ...p, [ref.track]: list.map((x) => (x.id === ref.id ? { ...x, ...patch } : x)) };
}

/** Replaces a caption group's words, spreading them evenly over its time. */
export function setCaptionText(p: Project, id: string, text: string): Project {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  return {
    ...p,
    captions: {
      ...p.captions,
      groups: p.captions.groups
        .map((g) => {
          if (g.id !== id) return g;
          if (!words.length) return null;
          const step = (g.end - g.start) / words.length;
          const old = new Set(g.words.filter((w) => w.emphasis).map((w) => w.text.toLowerCase()));
          return {
            ...g,
            words: words.map((w, i) => ({
              text: w,
              start: r3(g.start + i * step),
              end: r3(g.start + (i + 1) * step),
              ...(old.has(w.toLowerCase()) ? { emphasis: true } : {}),
            })),
          };
        })
        .filter((g): g is CaptionGroup => g !== null),
    },
  };
}

// ---------------------------------------------------------------- snapping

/** Times worth snapping to: the playhead, clip boundaries and item edges. */
export function snapTargets(p: Project, playhead: number, exclude?: ItemRef): number[] {
  const out = new Set<number>([0, projectDuration(p), r3(playhead)]);
  for (const c of clipRanges(p.clips)) out.add(c.start).add(c.end);
  for (const track of SPAN_TRACKS) {
    for (const it of p[track] as (Span & { id: string })[]) {
      if (exclude && exclude.track === track && exclude.id === it.id) continue;
      out.add(it.start).add(it.end);
    }
  }
  for (const s of p.sfx) if (!(exclude?.track === "sfx" && exclude.id === s.id)) out.add(s.start);
  for (const g of p.captions.groups) {
    if (!(exclude?.track === "captions" && exclude.id === g.id)) out.add(g.start).add(g.end);
  }
  return [...out].sort((a, b) => a - b);
}

/** Snaps `t` to the nearest target within `threshold` seconds. */
export function snap(t: number, targets: number[], threshold: number): number {
  let best = t;
  let dist = threshold;
  for (const x of targets) {
    const d = Math.abs(x - t);
    if (d <= dist) {
      best = x;
      dist = d;
    }
  }
  return best;
}

/** Snaps a moving item: whichever of its start or end lands closer to a target wins. */
export function snapSpan(start: number, len: number, targets: number[], threshold: number): number {
  const s = snap(start, targets, threshold);
  const e = snap(start + len, targets, threshold);
  const ds = Math.abs(s - start);
  const de = Math.abs(e - (start + len));
  if (s !== start && (e === start + len || ds <= de)) return s;
  if (e !== start + len) return e - len;
  return start;
}
