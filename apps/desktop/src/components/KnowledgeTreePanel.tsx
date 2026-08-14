/**
 * Purpose: right column — 探索 (this session's chain plus 收线 into the exploration atlas)
 * and 全部 (whole tree, capped list) tabs. Click any node to anchor.
 * Main exports: KnowledgeTreePanel.
 */
import { useState } from "react";
import { capTreeItems, flattenTree } from "../lib/knowledgeNavModel";
import { useChatStore } from "../stores/chatStore";
import { useKnowledgeStore } from "../stores/knowledgeStore";
import { AtlasView } from "./AtlasView";
import { ExploreTabView } from "./ExploreTabView";
import { NodeButton } from "./NodeButton";

export function KnowledgeTreePanel() {
  const [view, setView] = useState<"explore" | "tree">("explore");
  const [atlasOpen, setAtlasOpen] = useState(false);
  const nodes = useKnowledgeStore((state) => state.nodes);
  const conversationId = useChatStore((state) => state.activeConversationId);

  if (atlasOpen && conversationId !== null) {
    return (
      <aside className="flex h-full w-64 flex-col border-l border-stone-200 bg-white">
        <AtlasView conversationId={conversationId} onBack={() => setAtlasOpen(false)} />
      </aside>
    );
  }

  const tabClass = (active: boolean) =>
    `flex-1 rounded-lg px-2 py-1 text-xs transition-colors ${
      active ? "bg-amber-100 text-stone-700" : "text-stone-400 hover:bg-stone-50"
    }`;

  const { visible: visibleTreeItems, totalCount, isCapped } = capTreeItems(flattenTree(nodes));

  return (
    <aside className="flex h-full w-64 flex-col border-l border-stone-200 bg-white">
      <div className="flex gap-1 border-b border-stone-100 p-2">
        <button
          type="button"
          onClick={() => setView("explore")}
          className={tabClass(view === "explore")}
        >
          🧭 探索
        </button>
        <button type="button" onClick={() => setView("tree")} className={tabClass(view === "tree")}>
          🌳 全部
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {view === "explore" && (
          <ExploreTabView conversationId={conversationId} onOpenAtlas={() => setAtlasOpen(true)} />
        )}
        {view === "tree" &&
          (nodes.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs leading-relaxed text-stone-400">
              你学过的知识点
              <br />
              会在这里形成一份可导航的目录
            </p>
          ) : (
            <>
              {isCapped && (
                <p className="px-2 pb-1 text-[11px] text-stone-400">
                  共 {totalCount} 个，显示最近 {visibleTreeItems.length} 个
                </p>
              )}
              {visibleTreeItems.map(({ node, depth }) => (
                <NodeButton key={node.id} node={node} depth={depth} />
              ))}
            </>
          ))}
      </div>
      <p className="border-t border-stone-100 px-3 py-2 text-[11px] leading-relaxed text-stone-400">
        💡 点击任意知识点可<span className="text-amber-600">锚定</span>
        ，让接下来的对话围绕它展开
      </p>
    </aside>
  );
}
