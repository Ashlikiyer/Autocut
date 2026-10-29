// Synthesizes AutoCut's sound effects with ffmpeg.wasm (no third-party audio,
// so there's nothing to license). Output: public/sfx/*.ogg
// Run with: npm run make:sfx
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const coreDir = join(root, "node_modules/@ffmpeg/core/dist/umd/");
const out = join(root, "public/sfx");

// The UMD core expects a worker-ish global scope.
globalThis.self = globalThis;
globalThis.location = { href: "file:///" + coreDir.replace(/\\/g, "/") };

const noise = "(random(0)*2-1)";
const SOUNDS = {
  whoosh: { src: `anoisesrc=d=0.55:c=pink:a=0.9`, af: "highpass=f=300,lowpass=f=4500,afade=t=in:d=0.3:curve=exp,afade=t=out:st=0.3:d=0.25" },
  whoosh2: { src: `anoisesrc=d=0.8:c=white:a=0.6`, af: "highpass=f=200,lowpass=f=2500,flanger=delay=2:depth=4:speed=1.5,afade=t=in:d=0.45:curve=exp,afade=t=out:st=0.45:d=0.35" },
  pop: { expr: "exp(-t*35)*sin(2*PI*(800*t-3000*t*t))", d: 0.18 },
  ding: { expr: "exp(-t*3)*(0.6*sin(2*PI*1318*t)+0.25*sin(2*PI*2637*t)+0.1*sin(2*PI*3955*t))", d: 1.2 },
  bell: { expr: "exp(-t*2)*(0.5*sin(2*PI*880*t)+0.3*exp(-t*3)*sin(2*PI*2428*t)+0.2*sin(2*PI*1760*t))", d: 1.6 },
  click: { expr: `exp(-t*400)*${noise}`, d: 0.04, af: "highpass=f=1500" },
  "swoosh-up": { expr: `exp(-pow((t-0.25)/0.12,2))*(0.45*sin(2*PI*(300*t+1800*t*t))+0.45*${noise})`, d: 0.5, af: "lowpass=f=6000" },
  "swoosh-down": { expr: `exp(-pow((t-0.25)/0.12,2))*(0.45*sin(2*PI*(1200*t-1000*t*t))+0.45*${noise})`, d: 0.5, af: "lowpass=f=6000" },
  boom: { expr: `exp(-t*3.5)*(0.9*sin(2*PI*(70*t-20*t*t))+0.3*exp(-t*20)*${noise})`, d: 1.2, af: "lowpass=f=500" },
  scratch: { expr: `exp(-t*4)*0.5*sin(2*PI*(300+250*sin(2*PI*9*t))*t)+0.4*exp(-t*6)*${noise}`, d: 0.6, af: "bandpass=f=1200:w=1.2" },
  shutter: { expr: `exp(-t*120)*${noise}+gte(t,0.09)*exp(-(t-0.09)*120)*${noise}`, d: 0.22, af: "highpass=f=1000" },
  typing: {
    expr: [0, 0.11, 0.19, 0.33, 0.41, 0.55].map((s) => `gte(t,${s})*exp(-(t-${s})*300)*${noise}`).join("+"),
    d: 0.7,
    af: "highpass=f=1200",
  },
};

const require = createRequire(import.meta.url);
const core = await require(join(coreDir, "ffmpeg-core.js"))({
  wasmBinary: readFileSync(join(coreDir, "ffmpeg-core.wasm")),
});
core.setLogger(() => {});
mkdirSync(out, { recursive: true });

for (const [name, s] of Object.entries(SOUNDS)) {
  const input = s.src ?? `aevalsrc='${s.expr}':s=48000:d=${s.d}`;
  const af = [s.af, "volume=0.9", "alimiter=limit=0.89"].filter(Boolean).join(",");
  core.exec("-f", "lavfi", "-i", input, "-af", af, "-ar", "48000", "-ac", "1", "-c:a", "libopus", "-b:a", "96k", "-y", `/${name}.ogg`);
  const ret = core.ret;
  core.reset();
  if (ret !== 0) throw new Error(`Failed to make ${name}`);
  writeFileSync(join(out, `${name}.ogg`), core.FS.readFile(`/${name}.ogg`));
  console.log(`[make-sfx] ${name}.ogg`);
}
