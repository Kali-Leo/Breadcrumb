/**
 * Purpose: 探索 tab body — this session's chain (compact list, click to anchor) and the
 * 收线 button that opens the exploration atlas; each section renders only when non-empty.
 * Main exports: ExploreTabView.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { useKnowledgeStore } from "../stores/knowledgeStore";
import { NodeButton } from "./NodeButton";

interface ExploreTabViewProps {
  conversationId: string | null;
  onOpenAtlas: () => void;
}

export function ExploreTabView({ conversationId, onOpenAtlas }: ExploreTabViewProps) {
  const nodes = useKnowledgeStore((state) => state.nodes);
  const sessionNodeIds = useKnowledgeStore((state) => state.sessionNodeIds);

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const sessionNodes = sessionNodeIds
    .map((nodeId) => nodeById.get(nodeId))
    .filter((node): node is KnowledgeNodeRow => node !== undefined);

  if (sessionNodes.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-xs leading-relaxed text-stone-400">
        这次对话走过的知识点
        <br />
        会出现在这里。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        {sessionNodes.map((node) => (
          <NodeButton key={node.id} node={node} depth={0} />
        ))}
      </div>
      {conversationId !== null && (
        <button
          type="button"
          onClick={onOpenAtlas}
          className="mx-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-700 transition-colors hover:bg-amber-100"
        >
          收线 · 看看这次走了哪些路
        </button>
      )}
    </div>
  );
}
