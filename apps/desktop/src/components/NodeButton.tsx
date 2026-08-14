/**
 * Purpose: one clickable knowledge-node row — three-state coloring (anchored/fresh/plain),
 * depth-indented for tree rendering. Shared by KnowledgeTreePanel and ExploreTabView.
 * Main exports: NodeButton.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { useKnowledgeStore } from "../stores/knowledgeStore";

export function NodeButton({ node, depth }: { node: KnowledgeNodeRow; depth: number }) {
  const freshNodeIds = useKnowledgeStore((state) => state.freshNodeIds);
  const anchoredNodeId = useKnowledgeStore((state) => state.anchoredNodeId);
  const toggleAnchor = useKnowledgeStore((state) => state.toggleAnchor);
  return (
    <button
      type="button"
      onClick={() => toggleAnchor(node.id)}
      title={node.summary}
      style={{ paddingLeft: `${8 + depth * 16}px` }}
      className={`block w-full truncate rounded-lg py-1.5 pr-2 text-left text-sm transition-colors ${
        node.id === anchoredNodeId
          ? "bg-amber-100 text-stone-800"
          : freshNodeIds.has(node.id)
            ? "bg-amber-50 text-stone-700"
            : "text-stone-600 hover:bg-stone-50"
      }`}
    >
      {depth > 0 && <span className="text-stone-300">└ </span>}
      {node.label}
      {node.id === anchoredNodeId && <span className="ml-1">📍</span>}
    </button>
  );
}
