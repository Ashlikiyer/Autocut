import type { VideoInfo } from "@/types";

/**
 * Parses the stream summary ffmpeg prints for `ffmpeg -i input`:
 *   Duration: 00:03:04.20, start: 0.000000, bitrate: 1234 kb/s
 *   Stream #0:0(und): Video: h264 (High), yuv420p, 1920x1080, 30 fps, ...
 *   Stream #0:1(und): Audio: aac (LC), 48000 Hz, stereo, fltp, 128 kb/s
 */
export function parseProbeLog(log: string[]): VideoInfo {
  const info: VideoInfo = {
    duration: 0,
    width: 0,
    height: 0,
    fps: 0,
    hasAudio: false,
  };
  for (const line of log) {
    const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line);
    if (d && !info.duration) {
      info.duration = +d[1] * 3600 + +d[2] * 60 + parseFloat(d[3]);
    }
    if (/Stream #\d+:\d+.*Video:/.test(line) && !info.width) {
      const size = /,\s*(\d{2,5})x(\d{2,5})/.exec(line);
      if (size) {
        info.width = +size[1];
        info.height = +size[2];
      }
      const fps =
        /([\d.]+)\s*fps/.exec(line) ?? /([\d.]+)\s*tbr/.exec(line);
      if (fps) info.fps = parseFloat(fps[1]);
    }
    if (/Stream #\d+:\d+.*Audio:/.test(line)) info.hasAudio = true;
    const rot =
      /rotate\s*:\s*(-?\d+)/.exec(line) ?? /rotation of (-?[\d.]+) degrees/.exec(line);
    if (rot && info.rotation === undefined) info.rotation = Math.round(parseFloat(rot[1]));
  }
  return info;
}

/** Parses `time=00:00:12.34` from an ffmpeg progress log line. */
export function parseLogTime(line: string): number | null {
  const m = /time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line);
  return m ? +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]) : null;
}
