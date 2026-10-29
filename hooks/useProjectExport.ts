"use client";

import { useCallback, useRef, useState } from "react";
import { engineMode, fallBackToSingleThread, loadFFmpeg } from "@/hooks/useFFmpeg";
import { prepareAssets } from "@/lib/engine/assets";
import { FINAL_QUALITY, outputFps, outputSize } from "@/lib/engine/filtergraph";
import { mountInput, renderEdit } from "@/lib/engine/render";
import { projectToComposition } from "@/lib/editor/convert";
import type { Project } from "@/lib/editor/project";
import {
  overlayServerUrl,
  overlaySupports,
  requestCardOverlay,
  type CardOverlay,
} from "@/lib/overlay-client";

export type ExportState =
  | { status: "idle" }
  | { status: "running"; progress: number; label: string }
  | { status: "done" }
  | { status: "error"; message: string };

/**
 * Renders the editor's project at full quality with the same ffmpeg.wasm
 * pipeline as the auto edit, then downloads it. Uses the single-threaded
 * engine, since full renders freeze on the multithreaded one.
 */
export function useProjectExport() {
  const [state, setState] = useState<ExportState>({ status: "idle" });
  const running = useRef(false);

  const exportProject = useCallback(async (project: Project, source: File, customMusic: File | null) => {
    if (running.current) return;
    running.current = true;
    setState({ status: "running", progress: 0, label: "Preparing" });
    try {
      const comp = projectToComposition(project);
      if (comp.edl.outputDuration < 0.5) throw new Error("The edit is too short to export.");
      const info = project.info;

      // Animate the cards with HyperFrames when possible (reuses the auto
      // edit's overlay if the cards haven't changed); otherwise draw them here.
      let overlay: CardOverlay | null = null;
      if (overlayServerUrl() && overlaySupports(comp)) {
        setState({ status: "running", progress: 0, label: "Animating graphics" });
        const [fw, fh] = outputSize(info, FINAL_QUALITY, comp.vertical);
        try {
          overlay = await requestCardOverlay(comp, fw, fh, outputFps(info, FINAL_QUALITY));
        } catch (err) {
          console.warn("[export] HyperFrames unavailable, drawing cards in the browser", err);
        }
      }

      setState({ status: "running", progress: 0, label: "Rendering" });
      // Not loaded yet (e.g. a resumed edit) would load the multithreaded core.
      const ffmpeg = engineMode() === "single" ? await loadFFmpeg() : await fallBackToSingleThread();
      const inputPath = await mountInput(ffmpeg, source);
      const prepared = await prepareAssets(ffmpeg, comp, customMusic, overlay);
      const bytes = await renderEdit(ffmpeg, inputPath, info, comp, {
        quality: FINAL_QUALITY,
        x264Preset: "ultrafast",
        crf: 20,
        assets: prepared.assets,
        onProgress: (r) => setState({ status: "running", progress: r, label: "Rendering" }),
      });

      const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "video/mp4" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${source.name.replace(/\.[^.]+$/, "")}-autocut.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Free the full-size render once the browser has started the download.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setState({ status: "done" });
    } catch (err) {
      console.error("[export]", err);
      const msg = err instanceof Error ? err.message : String(err);
      setState({
        status: "error",
        // Every failed ffmpeg.wasm run ends in "Aborted()", so that alone isn't memory.
        message: /out of memory|OOM|RangeError/i.test(msg)
          ? "Your browser ran out of memory. Close other tabs and try again."
          : msg || "The export couldn't be finished.",
      });
    } finally {
      running.current = false;
    }
  }, []);

  const dismiss = useCallback(() => setState({ status: "idle" }), []);

  return { state, exportProject, dismiss };
}
