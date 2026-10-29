// Synthesizes simple background music loops with ffmpeg.wasm, so AutoCut
// ships with music it fully owns. Output: public/music/*.ogg + manifest.json
// Run with: npm run make:music
// Mono on purpose: this ffmpeg.wasm build crashes encoding stereo Opus.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const coreDir = join(root, "node_modules/@ffmpeg/core/dist/umd/");
const out = join(root, "public/music");

globalThis.self = globalThis;
globalThis.location = { href: "file:///" + coreDir.replace(/\\/g, "/") };

const noise = "(random(0)*2-1)";
const MAJ = [1, 1.26, 1.498];
const MIN = [1, 1.189, 1.498];
const note = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI → Hz

/** Picks values[i] for i = idx expression (nested ifs). */
const sel = (idx, values) =>
  values.reduceRight((acc, v, i) => (i === values.length - 1 ? `${v}` : `if(eq(${idx},${i}),${v},${acc})`), "");

/**
 * One track: chords per bar, optional plucked rhythm, bass, kick, hats, clap.
 * Every voice is an expression of t; the loop is `bars` long.
 */
function track({ bpm, chords, pad = 0, pluck = 0, pluckDiv = 2, bass = 0, kick = 0, hat = 0, clap = 0, boom = 0 }) {
  const beat = 60 / bpm;
  const bar = beat * 4;
  const len = bar * chords.length;
  const x = `mod(t,${bar.toFixed(4)})`; // time in bar
  const c = `floor(mod(t,${len.toFixed(4)})/${bar.toFixed(4)})`; // chord index
  const roots = chords.map(([r]) => note(r).toFixed(3));
  const third = chords.map(([r, q]) => (note(r) * (q === "m" ? MIN : MAJ)[1]).toFixed(3));
  const fifth = chords.map(([r]) => (note(r) * MAJ[2]).toFixed(3));
  const f = (i) => [sel(c, roots), sel(c, third), sel(c, fifth)][i];
  const chordTone = `(sin(2*PI*${f(0)}*t)+0.8*sin(2*PI*${f(1)}*t)+0.7*sin(2*PI*${f(2)}*t))/2.5`;
  const voices = [];
  if (pad) voices.push(`${pad}*min(1,${x}/0.6)*min(1,(${bar.toFixed(4)}-${x})/0.4)*${chordTone}`);
  if (pluck) {
    const step = beat / pluckDiv;
    voices.push(`${pluck}*exp(-mod(t,${step.toFixed(4)})*14)*${chordTone}`);
  }
  if (bass) voices.push(`${bass}*exp(-mod(t,${beat.toFixed(4)})*5)*sin(2*PI*${f(0)}/2*t)`);
  if (kick) {
    const k = `mod(t,${beat.toFixed(4)})`;
    voices.push(`${kick}*exp(-${k}*18)*sin(2*PI*(50+90*exp(-${k}*30))*${k})`);
  }
  if (hat) {
    const h = `mod(t+${(beat / 2).toFixed(4)},${beat.toFixed(4)})`;
    voices.push(`${hat}*exp(-${h}*80)*${noise}`);
  }
  if (clap) {
    const cl = `mod(t+${beat.toFixed(4)},${(beat * 2).toFixed(4)})`;
    voices.push(`${clap}*exp(-${cl}*30)*${noise}`);
  }
  if (boom) {
    const b = `mod(t,${(bar * 2).toFixed(4)})`;
    voices.push(`${boom}*exp(-${b}*2.5)*sin(2*PI*(45+30*exp(-${b}*8))*${b})`);
  }
  return { expr: voices.join("+"), d: len * 2 };
}

const TRACKS = [
  {
    file: "upbeat-1.ogg",
    mood: "upbeat",
    title: "Bright Steps",
    ...track({ bpm: 118, chords: [[60, "M"], [67, "M"], [69, "m"], [65, "M"]], pluck: 0.35, pluckDiv: 2, bass: 0.45, kick: 0.7, hat: 0.12, clap: 0.15 }),
    af: "lowpass=f=9000",
  },
  {
    file: "chill-1.ogg",
    mood: "chill",
    title: "Soft Window",
    ...track({ bpm: 78, chords: [[57, "m"], [65, "M"], [60, "M"], [67, "M"]], pad: 0.5, bass: 0.25, kick: 0.35, hat: 0.05 }),
    af: "lowpass=f=3500,aecho=0.6:0.5:180:0.3",
  },
  {
    file: "playful-1.ogg",
    mood: "playful",
    title: "Bouncy Marbles",
    ...track({ bpm: 112, chords: [[65, "M"], [62, "m"], [70, "M"], [72, "M"]], pluck: 0.4, pluckDiv: 4, bass: 0.35, kick: 0.45, hat: 0.08 }),
    af: "highpass=f=60",
  },
  {
    file: "dramatic-1.ogg",
    mood: "dramatic",
    title: "Long Shadow",
    ...track({ bpm: 70, chords: [[50, "m"], [46, "M"], [53, "M"], [48, "M"]], pad: 0.6, bass: 0.3, boom: 0.8 }),
    af: "lowpass=f=4000,aecho=0.7:0.6:300:0.35",
  },
];

const require = createRequire(import.meta.url);
const core = await require(join(coreDir, "ffmpeg-core.js"))({
  wasmBinary: readFileSync(join(coreDir, "ffmpeg-core.wasm")),
});
core.setLogger(() => {});
mkdirSync(out, { recursive: true });

for (const t of TRACKS) {
  const af = `${t.af},loudnorm=I=-16:TP=-2:LRA=11,aresample=48000`;
  core.exec("-f", "lavfi", "-i", `aevalsrc='${t.expr}':s=48000:d=${t.d.toFixed(3)}`, "-af", af, "-ac", "1", "-c:a", "libopus", "-b:a", "96k", "-y", `/${t.file}`);
  const ret = core.ret;
  core.reset();
  if (ret !== 0) throw new Error(`Failed to make ${t.file}`);
  writeFileSync(join(out, t.file), core.FS.readFile(`/${t.file}`));
  console.log(`[make-music] ${t.file}`);
}

writeFileSync(
  join(out, "manifest.json"),
  JSON.stringify(
    {
      tracks: TRACKS.map(({ file, mood, title }) => ({
        file,
        mood,
        title,
        credit: "Synthesized by AutoCut (scripts/make-music.mjs)",
      })),
    },
    null,
    2,
  ) + "\n",
);
