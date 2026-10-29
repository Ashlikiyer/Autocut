import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { MockCaption, MockFrame, MockPill, ZoomMarks } from "@/components/landing/MockFrame";
import { ScrollReveal } from "@/components/landing/Reveal";

/* Small shared bits ----------------------------------------------------- */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-[5px] border border-white/[.07] bg-[#141416] px-2.5 py-1.5 font-mono text-[10.5px] font-medium tracking-[.12em] whitespace-nowrap text-faint uppercase">
      <span className="size-[7px] rotate-45 border border-primary" aria-hidden />
      {children}
    </span>
  );
}

function Section({ id, className, children }: { id?: string; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={cn("mx-auto w-full max-w-[1200px] scroll-mt-20 px-4 sm:px-8", className)}>
      {children}
    </section>
  );
}

const card = "rounded-[12px] border border-white/[.07] bg-[#111113]";

/* Content ---------------------------------------------------------------- */

const PROMISES = [
  { mark: "₱0", title: "Free, no watermark", body: "Every part runs on free tiers or in your browser." },
  { mark: "AI", title: "No skills needed", body: "An AI director decides what to cut and where effects go." },
  { mark: "◇", title: "Private by design", body: "Your video stays on your device. Only audio is sent." },
  { mark: "EN·TL", title: "Speaks Taglish", body: "Removes \"um\" and \"uh\" — and \"ano\", \"parang\", \"kasi\"." },
];

const STEPS = [
  { title: "Drop in your video", body: "MP4, MOV or WebM, up to 15 minutes. It's read on your device — nothing is uploaded." },
  { title: "Pick a style", body: "Let the AI choose, or pick Energetic, Clean, Funny, Podcast or Creator. Each one tunes captions, effects, sound and music together." },
  { title: "Preview and download", body: "Tweak the captions and effects, fine-tune on the timeline if you like, then download the MP4. No watermark." },
];

const FAQS = [
  { q: "Is it really free?", a: "Yes. No subscription and no watermark. You can make three videos a day, no account needed." },
  { q: "Do I need editing skills?", a: "No. Pick a style — or let the AI pick — and AutoCut handles cuts, captions, zooms, sounds and music. You can still fine-tune anything on the timeline." },
  { q: "Does my video get uploaded?", a: "No. All editing happens in your browser. Only a small compressed audio file is sent for transcription and, if you allow it, a few low-res snapshots so the AI can see the video. Nothing is stored." },
  { q: "Does it understand Taglish?", a: "Yes. It transcribes English and Filipino, and removes fillers like \"ano\", \"parang\" and \"kasi\" along with \"um\" and \"uh\"." },
  { q: "How long can my video be?", a: "Up to 15 minutes and 500 MB, in MP4, MOV or WebM. You get a 1080×1920 MP4 for TikTok, Reels and Shorts." },
  { q: "Which browser should I use?", a: "Desktop Chrome works best. Mobile support is coming later." },
];

const PRESET_BARS = [
  { name: "Energetic", mood: "upbeat", level: 9 },
  { name: "Funny", mood: "playful", level: 10 },
  { name: "Creator", mood: "upbeat", level: 6 },
  { name: "Clean", mood: "chill", level: 3 },
  { name: "Podcast", mood: "none", level: 1 },
];

// Deterministic "waveform": speech bars with orange sound-effect hits.
const WAVE = Array.from({ length: 60 }, (_, i) => {
  const sfx = [7, 19, 31, 44, 53].includes(i);
  const v = 0.25 + 0.75 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.37));
  return { sfx, h: Math.round((sfx ? 0.95 : v) * 100) };
});

/* Page --------------------------------------------------------------------- */

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* HERO */}
      <div className="mx-auto flex max-w-[900px] flex-col items-center gap-6 px-4 pt-20 pb-14 text-center sm:px-8 sm:pt-28">
        <Eyebrow>The free AI video editor</Eyebrow>
        <h1 className="m-0 text-[clamp(46px,6.4vw,80px)] leading-[1.02] font-medium tracking-[-0.04em]">
          Raw video in.
          <br />
          <span className="font-serif font-normal tracking-[-0.01em] text-[#a1a1a8] italic">Scroll-stopping edit out.</span>
        </h1>
        <p className="max-w-[520px] text-base leading-relaxed text-[#a1a1a8]">
          Upload a video, pick a style, download the edit. AutoCut cuts the silences and fillers, then adds captions,
          zooms, sound and music — in English or Taglish.
        </p>
        <Link href="/edit" className={buttonVariants({ variant: "light", size: "xl" })}>
          Upload video
        </Link>
        <p className="flex flex-wrap items-center justify-center gap-x-2 font-mono text-[11px] text-faint">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden />
          <span className="text-subtle">No watermark</span> · 3 free videos a day · no account
        </p>
      </div>

      {/* GALLERY */}
      <Section className="pb-20">
        <div
          className="grid grid-cols-2 gap-3 md:grid-cols-4"
          style={{ maskImage: "linear-gradient(180deg, #000 70%, transparent)" }}
          aria-label="Example edits"
        >
          <div className="flex flex-col gap-3">
            <MockFrame scene="warm" label="vlog · energetic" className="aspect-[3/2]">
              <MockCaption look="energetic" words={["THE", "SECRET"]} hi={1} className="bottom-[18%]" scale={0.8} />
            </MockFrame>
            <MockFrame scene="night" label="creator" className="aspect-[9/16]">
              <MockPill text="Step 01 · set it up" className="top-[9%]" />
              <MockCaption look="creator" words={["SIMPLE"]} className="bottom-[34%]" />
            </MockFrame>
          </div>
          <div className="flex flex-col gap-3 md:pt-10">
            <MockFrame scene="cool" label="9:16 edit" zoom={1.18} className="aspect-[9/16]">
              <ZoomMarks amount="1.2×" />
              <MockCaption look="energetic" words={["NOBODY", "TELLS", "YOU"]} hi={0} className="bottom-[22%]" />
            </MockFrame>
            <MockFrame scene="green" label="product demo" className="aspect-[3/2]">
              <MockCaption look="clean" words={["Here's", "what", "I", "learned"]} className="bottom-[14%]" />
            </MockFrame>
          </div>
          <div className="flex flex-col gap-3">
            <MockFrame scene="studio" label="podcast clip" shift={-12} className="aspect-[3/2]">
              <MockCaption look="podcast" words={["So", "the", "real", "question", "is…"]} hi={3} className="bottom-[14%]" scale={0.85} />
            </MockFrame>
            <MockFrame scene="dusk" label="funny" className="aspect-[9/16]">
              <span className="absolute top-[24%] left-1/2 -translate-x-1/2 rotate-[8deg] text-5xl" aria-hidden>😂</span>
              <MockCaption look="funny" words={["WAIT", "WHAT?!"]} hi={1} className="bottom-[24%]" />
            </MockFrame>
          </div>
          <div className="flex flex-col gap-3 md:pt-10">
            <MockFrame scene="night" label="9:16 edit" shift={10} className="aspect-[9/16]">
              <span className="absolute top-[20%] right-[16%] rotate-[-10deg] text-4xl" aria-hidden>🔥</span>
              <MockCaption look="energetic" words={["IT'S", "ACTUALLY", "SIMPLE"]} hi={2} className="bottom-[22%]" />
            </MockFrame>
            <MockFrame scene="warm" label="event recap" zoom={1.1} className="aspect-[3/2]">
              <MockCaption look="clean" words={["Best", "night", "ever"]} className="bottom-[14%]" />
            </MockFrame>
          </div>
        </div>
      </Section>

      {/* PROMISES */}
      <Section className="flex flex-col items-center gap-3 pb-24 text-center">
        <h2 className="m-0 text-[clamp(32px,4vw,46px)] leading-tight font-medium tracking-[-0.035em]">Nothing gets in your way.</h2>
        <p className="text-[15px] text-[#a1a1a8]">No timeline to learn, no subscription to start, no file to upload.</p>
        <div className="mt-10 grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PROMISES.map((p) => (
            <div key={p.title} className={cn(card, "flex flex-col items-center gap-2 px-6 py-7")}>
              <span className="mb-2 grid h-7 min-w-7 place-items-center rounded-md border border-white/10 bg-[#1a1a1d] px-1.5 font-mono text-[10px] font-medium text-primary">
                {p.mark}
              </span>
              <h3 className="m-0 text-[15px] font-semibold">{p.title}</h3>
              <p className="text-[13px] leading-relaxed text-faint">{p.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* REVEAL */}
      <Section className="flex flex-col items-center gap-6 pb-16">
        <ScrollReveal lines={[{ words: ["Cuts,", "captions,", "motion."] }, { words: ["One", "upload."], serif: true }]} />
        <p className="max-w-[460px] text-center text-[15px] leading-relaxed text-[#a1a1a8]">
          A full edit from one raw video, ready for TikTok, Reels and Shorts.
        </p>
      </Section>
      <Section className="grid gap-3 pb-28 md:grid-cols-2">
        <div className={cn(card, "relative flex aspect-[4/3] flex-col justify-end overflow-hidden p-5")}>
          <div className="absolute inset-0 grid grid-cols-2 gap-3 p-5 pb-16">
            <MockFrame scene="studio" label="before · 3:04" className="h-full opacity-60 grayscale" />
            <MockFrame scene="warm" label="after · 1:52" zoom={1.12} className="h-full">
              <MockCaption look="energetic" words={["THE", "SECRET"]} hi={1} className="bottom-[16%]" scale={0.8} />
            </MockFrame>
          </div>
          <div className="relative flex items-end justify-between">
            <h3 className="m-0 text-[17px] font-semibold">Short-form edits</h3>
            <span className="font-mono text-[11px] text-subtle">5 styles + AI pick →</span>
          </div>
        </div>
        <div className={cn(card, "relative flex aspect-[4/3] flex-col justify-end overflow-hidden p-5")}>
          <MiniTimeline />
          <div className="relative flex items-end justify-between">
            <h3 className="m-0 text-[17px] font-semibold">Fine-tune on a timeline</h3>
            <span className="font-mono text-[11px] text-subtle">optional →</span>
          </div>
        </div>
      </Section>

      {/* HOW IT WORKS */}
      <Section id="how" className="grid gap-12 pb-28 md:grid-cols-[1fr_1.25fr]">
        <div className="flex flex-col items-start gap-5">
          <Eyebrow>Upload, pick, post</Eyebrow>
          <h2 className="m-0 text-[clamp(34px,4vw,46px)] leading-[1.08] font-medium tracking-[-0.035em]">
            From raw clip
            <br />
            to ready post
          </h2>
          <p className="max-w-[360px] text-[15px] leading-relaxed text-[#a1a1a8]">
            No timeline needed, no keyframes, no export settings. Most videos are done in a few minutes.
          </p>
          <Link href="/edit" className={buttonVariants({ variant: "secondary", size: "lg", className: "border-white/10 px-3.5" })}>
            Try it with a video
          </Link>
        </div>
        <ol className="m-0 flex list-none flex-col p-0">
          {STEPS.map((s, i) => (
            <li key={s.title} className="grid grid-cols-[32px_1fr] gap-4 border-white/[.06] py-8 first:pt-0 sm:grid-cols-[32px_1fr_220px] [&:not(:first-child)]:border-t">
              <span className="pt-1 font-mono text-[11px] font-medium text-primary">{String(i + 1).padStart(2, "0")}</span>
              <div className="flex flex-col gap-2">
                <h3 className="m-0 text-xl font-medium tracking-[-0.02em]">{s.title}</h3>
                <p className="text-sm leading-relaxed text-[#a1a1a8]">{s.body}</p>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <StepArt step={i} />
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* FEATURES */}
      <div className="border-t border-white/[.06]">
        <Section id="features" className="flex flex-col items-center gap-3 pt-24 pb-28 text-center">
          <Eyebrow>Features</Eyebrow>
          <h2 className="m-0 mt-3 text-[clamp(34px,4vw,46px)] leading-[1.05] font-medium tracking-[-0.035em]">
            Everything an edit needs.
            <br />
            <span className="font-serif font-normal tracking-[-0.01em] text-[#a1a1a8] italic">Done for you.</span>
          </h2>
          <p className="text-[15px] text-[#a1a1a8]">Effect counts are capped per minute, so an edit never feels chaotic.</p>

          <div className="mt-10 grid w-full gap-3 text-left lg:grid-cols-[1.75fr_1fr]">
            <div className="flex flex-col gap-3">
              <div className={cn(card, "grid gap-6 p-6 sm:grid-cols-[1fr_1.1fr]")}>
                <div className="flex flex-col gap-2">
                  <span className="font-mono text-[10px] tracking-[.14em] text-faint uppercase">Captions</span>
                  <h3 className="m-0 text-lg font-semibold">Word-by-word captions</h3>
                  <p className="text-[13px] leading-relaxed text-[#a1a1a8]">
                    Each word appears the moment it&apos;s said and leaves when you stop talking. Five styles,
                    switchable after render.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["energetic", ["THE", "SECRET"], 1],
                      ["funny", ["WAIT", "WHAT"], 1],
                      ["clean", ["The", "secret"], -1],
                      ["podcast", ["the", "secret"], 1],
                    ] as const
                  ).map(([look, words, hi]) => (
                    <div key={look} className="relative h-[86px] overflow-hidden rounded-lg border border-white/[.07] bg-[repeating-linear-gradient(45deg,#141416,#141416_6px,#17171a_6px,#17171a_12px)]">
                      <span className="absolute top-2 left-2.5 font-mono text-[9.5px] text-faint">{look}</span>
                      <MockCaption look={look} words={[...words]} hi={hi} className="bottom-3" scale={0.75} />
                    </div>
                  ))}
                </div>
              </div>

              <div className={cn(card, "flex flex-col gap-4 p-6")}>
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div className="flex flex-col gap-2">
                    <span className="font-mono text-[10px] tracking-[.14em] text-faint uppercase">Sound</span>
                    <h3 className="m-0 text-lg font-semibold">Sound that lands on the cut</h3>
                  </div>
                  <span className="flex gap-4 font-mono text-[10.5px] text-faint">
                    <span className="flex items-center gap-1.5"><span className="size-1.5 bg-primary" />sfx</span>
                    <span className="flex items-center gap-1.5"><span className="size-1.5 bg-[#3a3a3f]" />speech</span>
                    <span>-14 LUFS</span>
                  </span>
                </div>
                <div className="flex h-[60px] items-center gap-[3px]" aria-hidden>
                  {WAVE.map((w, i) => (
                    <span key={i} className={cn("flex-1 rounded-[1px]", w.sfx ? "bg-primary" : "bg-[#2e2e33]")} style={{ height: `${w.h}%` }} />
                  ))}
                </div>
                <p className="text-[13px] text-[#a1a1a8]">
                  Whoosh, pop and ding timed to effects. Music ducks automatically whenever someone talks.
                </p>
              </div>
            </div>

            <div className={cn(card, "flex flex-col gap-4 p-6")}>
              <div className="grid grid-cols-2 gap-2">
                <MockFrame scene="cool" label="zoom" zoom={1.25} className="aspect-[4/3]">
                  <ZoomMarks amount="1.3×" />
                </MockFrame>
                <MockFrame scene="dusk" label="emoji pop" className="aspect-[4/3]">
                  <span className="absolute top-[30%] left-1/2 -translate-x-1/2 text-3xl" aria-hidden>🤯</span>
                </MockFrame>
                <MockFrame scene="night" label="text pop" className="col-span-2 aspect-[16/9]">
                  <MockPill text="3 mistakes to avoid" className="top-[14%]" />
                  <MockCaption look="creator" words={["STOP"]} className="bottom-[22%]" />
                </MockFrame>
              </div>
              <span className="mt-2 font-mono text-[10px] tracking-[.14em] text-faint uppercase">Motion</span>
              <h3 className="m-0 text-lg font-semibold">Zooms, pops and transitions</h3>
              <p className="text-[13px] leading-relaxed text-[#a1a1a8]">
                Punch-ins on key lines, emoji and keyword pops, step cards and flash cuts — placed by the AI
                director, animated with HyperFrames.
              </p>
            </div>

            <div className={cn(card, "grid gap-6 p-6 lg:col-span-2 lg:grid-cols-[1fr_1.6fr]")}>
              <div className="flex flex-col gap-2">
                <span className="font-mono text-[10px] tracking-[.14em] text-faint uppercase">Style presets</span>
                <h3 className="m-0 text-lg font-semibold">One tap sets the whole vibe</h3>
                <p className="text-[13px] leading-relaxed text-[#a1a1a8]">
                  Each preset tunes caption look, effect density, SFX and music together — or let the AI pick
                  after watching your video.
                </p>
              </div>
              <div className="flex flex-col gap-2.5">
                {PRESET_BARS.map((p) => (
                  <div key={p.name} className="grid grid-cols-[76px_1fr_56px] items-center gap-4 text-[13px]">
                    <span className="font-medium">{p.name}</span>
                    <span className="flex h-3.5 gap-1" aria-label={`${p.level} of 12`}>
                      {Array.from({ length: 12 }, (_, i) => (
                        <span
                          key={i}
                          className={cn("flex-1 rounded-[2px]", i < p.level ? (i >= 8 ? "bg-primary" : "bg-subtle") : "bg-[#1f1f22]")}
                        />
                      ))}
                    </span>
                    <span className="text-right font-mono text-[10.5px] text-faint">{p.mood}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>
      </div>

      {/* PRIVACY */}
      <div className="border-t border-white/[.06]">
        <Section id="privacy" className="grid items-center gap-12 py-24 md:grid-cols-2">
          <div className="flex flex-col items-start gap-5">
            <Eyebrow>Private by design</Eyebrow>
            <h2 className="m-0 text-[clamp(34px,4vw,46px)] leading-[1.08] font-medium tracking-[-0.035em]">
              Your video never
              <br />
              leaves your device
            </h2>
            <p className="max-w-[400px] text-[15px] leading-relaxed text-[#a1a1a8]">
              Cutting, captions and rendering all run in your browser. Only a small compressed audio file is sent
              for transcription — and nothing is stored.
            </p>
          </div>
          <div className={cn(card, "overflow-hidden font-mono text-xs")}>
            <div className="flex justify-between border-b border-white/[.06] px-4 py-3 text-[11px] text-faint">
              <span>› network</span>
              <span>this session</span>
            </div>
            <div className="flex flex-col gap-3.5 px-4 py-4">
              <NetRow icon="×" dim name="your-video.mov" note="stays on your device" size="212 MB" />
              <NetRow icon="↑" name="POST /api/transcribe · audio.opus" size="1.4 MB" />
              <NetRow icon="↑" name="POST /api/plan · transcript.json" size="18 KB" />
              <NetRow icon="↑" name="+ snapshots.jpg" note="only if you allow it" size="~60 KB" />
            </div>
            <div className="flex justify-between border-t border-white/[.06] px-4 py-3.5">
              <span className="text-faint">= media stored on our servers</span>
              <span className="font-medium">0 B</span>
            </div>
          </div>
        </Section>
      </div>

      {/* FAQ */}
      <div className="border-t border-white/[.06]">
        <Section id="faq" className="grid gap-10 py-24 md:grid-cols-[1fr_2fr]">
          <h2 className="m-0 text-[clamp(34px,4vw,46px)] font-medium tracking-[-0.035em]">Questions</h2>
          <dl className="m-0">
            {FAQS.map((f, i) => (
              <div key={f.q} className="grid grid-cols-[32px_1fr] gap-x-4 border-t border-white/[.06] py-6">
                <span className="pt-0.5 font-mono text-[11px] font-medium text-primary">{String(i + 1).padStart(2, "0")}</span>
                <div className="flex flex-col gap-2">
                  <dt className="text-base font-semibold">{f.q}</dt>
                  <dd className="m-0 text-sm leading-relaxed text-[#a1a1a8]">{f.a}</dd>
                </div>
              </div>
            ))}
          </dl>
        </Section>
      </div>

      {/* CTA */}
      <Section className="pb-20">
        <div className={cn(card, "flex flex-col items-center gap-6 px-6 py-20 text-center")}>
          <h2 className="m-0 text-[clamp(34px,4.4vw,54px)] leading-[1.05] font-medium tracking-[-0.035em]">
            Your next post is
            <br />
            <span className="font-serif font-normal tracking-[-0.01em] text-primary italic">one upload away.</span>
          </h2>
          <Link href="/edit" className={buttonVariants({ variant: "light", size: "xl" })}>
            Upload video — free
          </Link>
        </div>
      </Section>
    </div>
  );
}

function NetRow({ icon, name, note, size, dim }: { icon: string; name: string; note?: string; size: string; dim?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className={dim ? "text-ghost" : "text-primary"}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">
        <span className={dim ? "text-ghost line-through" : "text-[#ededee]"}>{name}</span>
        {note && <span className="ml-2 text-faint">{note}</span>}
      </span>
      <span className={dim ? "text-ghost" : "text-subtle"}>{size}</span>
    </div>
  );
}

/** Little illustrations next to each "how it works" step. */
function StepArt({ step }: { step: number }) {
  const box = "rounded-[10px] border border-white/[.07] bg-[#111113] p-3.5 font-mono text-[10.5px]";
  if (step === 0)
    return (
      <div className={box}>
        <div className="rounded-md border border-dashed border-white/15 py-3 text-center text-faint">drop video here</div>
        <div className="mt-3 flex items-center gap-2">
          <span className="h-[3px] flex-1 overflow-hidden rounded bg-[#26262a]">
            <span className="block h-full w-[65%] bg-primary" />
          </span>
          <span className="text-faint">65%</span>
        </div>
      </div>
    );
  if (step === 1)
    return (
      <div className={cn(box, "grid grid-cols-2 gap-1.5 font-sans text-[11.5px]")}>
        {["AI pick", "Energetic", "Funny", "Creator"].map((n, i) => (
          <span key={n} className={cn("rounded-md border px-2 py-1.5", i === 0 ? "border-primary text-foreground" : "border-white/[.07] text-faint")}>
            {n}
          </span>
        ))}
      </div>
    );
  return (
    <div className={cn(box, "flex flex-col gap-1.5")}>
      <span className="text-ghost">✓ render complete</span>
      <span className="text-[#ededee]">vlog-day3-autocut.mp4</span>
      <span className="text-primary">↓ 1080×1920 · 1:52</span>
    </div>
  );
}

/** A tiny, static version of the manual editor's timeline. */
function MiniTimeline() {
  const lane = (cls: string, items: [number, number][]) => (
    <div className="relative h-5">
      {items.map(([l, w], i) => (
        <span key={i} className={cn("absolute top-0 h-full rounded-[4px]", cls)} style={{ left: `${l}%`, width: `${w}%` }} />
      ))}
    </div>
  );
  return (
    <div className="absolute inset-x-5 top-5 bottom-16 flex flex-col justify-center gap-2 rounded-lg border border-white/[.07] bg-[#0d0d0f] p-4" aria-hidden>
      <div className="mb-1 flex justify-between font-mono text-[9px] text-ghost">
        {["0:00", "0:05", "0:10", "0:15", "0:20"].map((t) => <span key={t}>{t}</span>)}
      </div>
      {lane("bg-violet-500/70", [[6, 18], [44, 14]])}
      {lane("bg-amber-500/70", [[30, 8], [70, 9]])}
      <div className="relative h-9 overflow-hidden rounded-[4px] bg-[repeating-linear-gradient(90deg,#2a2520,#2a2520_22px,#1c1916_22px,#1c1916_24px)]">
        <span className="absolute inset-y-0 left-[38%] w-px bg-black/60" />
        <span className="absolute inset-y-0 left-[66%] w-px bg-black/60" />
      </div>
      {lane("bg-emerald-600/70", [[2, 20], [24, 16], [46, 22], [72, 18]])}
      {lane("bg-rose-500/70", [[12, 2], [40, 2], [58, 2], [83, 2]])}
      <span className="absolute top-3 bottom-3 left-[52%] w-0.5 bg-primary" />
    </div>
  );
}
