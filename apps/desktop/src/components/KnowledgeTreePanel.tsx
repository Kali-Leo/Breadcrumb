/**
 * Purpose: right column — the station map (this conversation's provenance tree) with the
 * 收线 atlas view behind it. The old whole-tree tab is gone (Leo 2026-08-14): free browsing
 * belongs to the memory palace; this panel is context only.
 * Main exports: KnowledgeTreePanel.
 */
import { useState } from "react";
import { useChatStore } from "../stores/chatStore";
import { AtlasView } from "./AtlasView";
import { ExploreTabView } from "./ExploreTabView";

export function KnowledgeTreePanel() {
  const [atlasOpen, setAtlasOpen] = useState(false);
  const conversationId = useChatStore((state) => state.activeConversationId);

  if (atlasOpen && conversationId !== null) {
    return (
      <aside className="flex h-full w-64 flex-col border-l border-stone-200 bg-white">
        <AtlasView conversationId={conversationId} onBack={() => setAtlasOpen(false)} />
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-64 flex-col border-l border-stone-200 bg-white">
      <div className="flex-1 overflow-y-auto p-2">
        <ExploreTabView conversationId={conversationId} onOpenAtlas={() => setAtlasOpen(true)} />
      </div>
      <p className="border-t border-stone-100 px-3 py-2 text-[11px] leading-relaxed text-stone-400">
        💡 点击站点定位到那一轮；「锚」让接下来的对话围绕它，「续」从那一站分出新线
      </p>
    </aside>
  );
}
