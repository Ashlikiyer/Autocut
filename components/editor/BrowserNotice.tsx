"use client";

import { useSyncExternalStore } from "react";
import { Info } from "lucide-react";

type Support = "ok" | "slow" | "unsupported";

function detect(): Support {
  if (typeof WebAssembly === "undefined" || typeof Worker === "undefined") {
    return "unsupported";
  }
  const ua = navigator.userAgent;
  const chromium = /Chrome\/|Edg\//.test(ua) && !/Mobile/.test(ua);
  // Without cross-origin isolation ffmpeg falls back to one thread.
  return chromium && window.crossOriginIsolated ? "ok" : "slow";
}

const subscribe = () => () => {};

export function BrowserNotice() {
  const support = useSyncExternalStore<Support>(subscribe, detect, () => "ok");
  if (support === "ok") return null;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
      <Info className="mt-0.5 size-4 shrink-0 text-primary" />
      <p>
        {support === "unsupported"
          ? "This browser can't run AutoCut's video engine. Please use desktop Chrome."
          : "AutoCut works best in desktop Chrome. It may be slower or run out of memory here — keep videos short."}
      </p>
    </div>
  );
}
