/** App-wide limits, shared by client checks and API routes. */
export const LIMITS = {
  maxVideoSeconds: 15 * 60,
  maxFileBytes: 500 * 1024 * 1024,
  /** Vercel's request body limit is 4.5 MB; stay safely under 4 MB. */
  maxAudioChunkBytes: 4 * 1024 * 1024,
  /** Target size when splitting audio into chunks. */
  targetAudioChunkBytes: 3.5 * 1024 * 1024,
  acceptedVideoTypes: ["video/mp4", "video/quicktime", "video/webm"],
  acceptedVideoExtensions: [".mp4", ".mov", ".webm"],
  acceptedAudioTypes: [
    "audio/ogg",
    "audio/opus",
    "audio/webm",
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/flac",
    "audio/mp4",
    "audio/m4a",
  ],
  defaultAnonDailyLimit: 3,
  /** Per IP, across all browsers on it (shared Wi-Fi, carrier NAT). */
  defaultAnonIpDailyLimit: 30,
  signedInDailyLimit: 10,
} as const;

export const SILENCE = {
  defaultThreshold: 0.5,
  minThreshold: 0.2,
  maxThreshold: 2,
  /** Kept on each side of a cut so speech doesn't sound clipped. */
  padding: 0.1,
  /** Keep segments shorter than this are dropped. */
  minSegment: 0.15,
  /** silencedetect settings for the second check. */
  noiseDb: -30,
  detectDuration: 0.5,
} as const;
