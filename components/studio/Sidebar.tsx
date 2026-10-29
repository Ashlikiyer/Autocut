"use client";

import { Captions, Music, Smile, Sparkles, Type, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/lib/editor/store";
import {
  CaptionsPanel,
  EffectsPanel,
  MusicPanel,
  SoundsPanel,
  StickersPanel,
  TextAssets,
  type Tab,
} from "./AssetPanels";
import { PropertiesPanel } from "./PropertiesPanel";

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "text", label: "Text", icon: Type },
  { id: "captions", label: "Captions", icon: Captions },
  { id: "sounds", label: "Sounds", icon: Volume2 },
  { id: "music", label: "Music", icon: Music },
  { id: "stickers", label: "Stickers", icon: Smile },
  { id: "effects", label: "Effects", icon: Sparkles },
];

/** Left icon rail and panel: assets for the active tab, or the selected item's properties. */
export function Sidebar({
  tab,
  onTab,
  onCustomMusic,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  onCustomMusic: (file: File) => void;
}) {
  const selection = useEditorStore((s) => s.selection);
  return (
    <div className="flex h-full min-h-0">
      <nav className="flex w-16 shrink-0 flex-col items-center gap-1 border-r py-2" aria-label="Editor tools">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              onTab(id);
              useEditorStore.getState().select(null);
            }}
            className={cn(
              "flex w-14 flex-col items-center gap-1 rounded-lg py-2 text-[10px] transition-colors",
              tab === id && !selection ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <Icon className="size-5" />
            {label}
          </button>
        ))}
      </nav>
      <aside className="w-72 shrink-0 overflow-y-auto border-r p-3">
        {selection ? (
          <PropertiesPanel selection={selection} />
        ) : tab === "text" ? (
          <TextAssets />
        ) : tab === "captions" ? (
          <CaptionsPanel />
        ) : tab === "sounds" ? (
          <SoundsPanel />
        ) : tab === "music" ? (
          <MusicPanel onCustomMusic={onCustomMusic} />
        ) : tab === "stickers" ? (
          <StickersPanel />
        ) : (
          <EffectsPanel />
        )}
      </aside>
    </div>
  );
}
