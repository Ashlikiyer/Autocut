import { cn } from "@/lib/utils";

/**
 * A mock 9:16 video frame drawn with CSS: a blurred "scene" with a person's
 * silhouette, plus AutoCut's captions and effects on top. Used on the landing
 * page in place of real footage.
 */

export type Scene = "warm" | "cool" | "dusk" | "studio" | "green" | "night";

const SCENES: Record<Scene, string> = {
  warm: "radial-gradient(60% 45% at 75% 18%, oklch(0.55 0.12 60 / .55), transparent 70%), radial-gradient(70% 50% at 10% 85%, oklch(0.45 0.1 30 / .5), transparent 70%), linear-gradient(170deg, #2a1f18, #120e0c)",
  cool: "radial-gradient(55% 40% at 20% 15%, oklch(0.5 0.08 240 / .55), transparent 70%), radial-gradient(70% 55% at 90% 90%, oklch(0.35 0.06 260 / .6), transparent 70%), linear-gradient(170deg, #161b24, #0c0e12)",
  dusk: "radial-gradient(60% 40% at 80% 10%, oklch(0.6 0.15 20 / .45), transparent 70%), radial-gradient(70% 50% at 0% 70%, oklch(0.4 0.12 300 / .45), transparent 70%), linear-gradient(170deg, #231824, #0f0b10)",
  studio: "radial-gradient(50% 35% at 50% 8%, oklch(0.75 0.02 80 / .35), transparent 70%), radial-gradient(80% 50% at 50% 100%, oklch(0.3 0.01 80 / .6), transparent 70%), linear-gradient(170deg, #1e1d1b, #0d0d0c)",
  green: "radial-gradient(60% 45% at 15% 20%, oklch(0.5 0.1 150 / .45), transparent 70%), radial-gradient(60% 50% at 95% 80%, oklch(0.4 0.08 110 / .45), transparent 70%), linear-gradient(170deg, #151c17, #0b0e0c)",
  night: "radial-gradient(40% 30% at 70% 25%, oklch(0.7 0.18 45 / .35), transparent 70%), radial-gradient(70% 50% at 20% 90%, oklch(0.3 0.05 270 / .6), transparent 70%), linear-gradient(170deg, #14131a, #09090b)",
};

/** Head and shoulders, soft-focused, so the frame reads as "someone talking". */
function Person({ shift = 0 }: { shift?: number }) {
  return (
    <div className="absolute inset-0" style={{ transform: `translateX(${shift}%)` }} aria-hidden>
      <div
        className="absolute left-1/2 top-[30%] aspect-square w-[34%] -translate-x-1/2 rounded-full blur-[2px]"
        style={{ background: "radial-gradient(circle at 45% 40%, #6b5446, #3b2d25 70%)" }}
      />
      <div
        className="absolute left-1/2 top-[52%] h-[60%] w-[78%] -translate-x-1/2 rounded-t-[45%] blur-[2px]"
        style={{ background: "linear-gradient(180deg, #3a3330, #1c1918 70%)" }}
      />
    </div>
  );
}

export function MockFrame({
  scene = "warm",
  label,
  zoom = 1,
  shift = 0,
  className,
  children,
}: {
  scene?: Scene;
  /** Small mono tag in the corner, e.g. "vlog · energetic". */
  label?: string;
  /** Punch-in zoom of the "footage". */
  zoom?: number;
  shift?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-[10px] border border-white/[.07] bg-[#111113]", className)}>
      <div className="absolute inset-0" style={{ background: SCENES[scene], transform: `scale(${zoom})` }}>
        <Person shift={shift} />
      </div>
      {/* Film grain-ish vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_40%,transparent_50%,rgba(0,0,0,.55))]" aria-hidden />
      {label && (
        <span className="absolute top-2.5 left-2.5 rounded bg-black/45 px-1.5 py-0.5 font-mono text-[9.5px] tracking-wide text-white/70 backdrop-blur-sm">
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

/** Caption looks, matching the real presets (fonts are the same ones the export uses). */
export type CaptionLook = "energetic" | "clean" | "funny" | "podcast" | "creator";

export function MockCaption({
  look,
  words,
  hi = -1,
  className,
  scale = 1,
}: {
  look: CaptionLook;
  words: string[];
  /** Index of the word being spoken (highlighted). */
  hi?: number;
  className?: string;
  scale?: number;
}) {
  const px = (n: number) => `${n * scale}px`;
  const base: Record<CaptionLook, React.CSSProperties> = {
    energetic: { fontFamily: '"AC Poppins"', fontWeight: 900, fontSize: px(19), textTransform: "uppercase", WebkitTextStroke: `${px(5)} #000`, paintOrder: "stroke fill", color: "#fff" },
    clean: { fontFamily: '"AC Poppins"', fontWeight: 700, fontSize: px(13), WebkitTextStroke: `${px(2.5)} #000`, paintOrder: "stroke fill", color: "#fff" },
    funny: { fontFamily: '"AC Bangers"', fontSize: px(22), letterSpacing: ".02em", textTransform: "uppercase", WebkitTextStroke: `${px(5)} #000`, paintOrder: "stroke fill", color: "#fff" },
    podcast: { fontFamily: '"AC Poppins"', fontWeight: 800, fontSize: px(13), lineHeight: 1.3, WebkitTextStroke: `${px(3)} #000`, paintOrder: "stroke fill", color: "#fff" },
    creator: { fontFamily: '"AC Poppins"', fontWeight: 900, fontSize: px(24), textTransform: "uppercase", WebkitTextStroke: `${px(5)} #000`, paintOrder: "stroke fill", color: "#fff", textShadow: `0 ${px(3)} 0 rgba(0,0,0,.5)` },
  };
  const highlight: Record<CaptionLook, string> = {
    energetic: "#C8FF2E",
    clean: "#fff",
    funny: "#FFD60A",
    podcast: "#7DD3FC",
    creator: "#FFC93C",
  };
  return (
    <p className={cn("absolute inset-x-[6%] text-center leading-[1.15]", className)} style={base[look]}>
      {words.map((w, i) => (
        <span key={i}>
          <span
            className="inline-block"
            style={i === hi ? { color: highlight[look], transform: "scale(1.1)", margin: "0 .1em" } : undefined}
          >
            {w}
          </span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </p>
  );
}

/** An AI card (pill, step), as the creator style draws them. */
export function MockPill({ text, className }: { text: string; className?: string }) {
  return (
    <span
      className={cn(
        "absolute left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#141A26]/90 px-2.5 py-1 text-[9px] font-bold tracking-wide whitespace-nowrap text-white uppercase",
        className,
      )}
      style={{ fontFamily: '"AC Poppins"' }}
    >
      <span className="grid size-3 place-items-center rounded-full bg-[#FFC93C] text-[7px] text-[#141A26]">✓</span>
      {text}
    </span>
  );
}

/** Corner marks that show a punch-in zoom. */
export function ZoomMarks({ amount }: { amount: string }) {
  return (
    <div className="absolute inset-[14%] rounded-md border border-primary/70" aria-hidden>
      <span className="absolute -top-2.5 right-1 rounded bg-primary px-1 font-mono text-[9px] font-medium text-primary-foreground">
        {amount}
      </span>
    </div>
  );
}
