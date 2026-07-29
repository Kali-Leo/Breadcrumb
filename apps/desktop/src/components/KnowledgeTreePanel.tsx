/**
 * Purpose: right column — renders the active conversation's knowledge tree with
 * indentation, highlights nodes born this round, click-to-anchor.
 * Main exports: KnowledgeTreePanel.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { useKnowledgeStore } from "../stores/knowledgeStore";

interface TreeItem {
  node: KnowledgeNodeRow;
  depth: number;
}

/** Flattens the parent-child forest into a depth-annotated list (creation order). */
function flattenTree(nodes: readonly KnowledgeNodeRow[]): TreeItem[] {
  const childrenByParent = new Map<string | null, KnowledgeNodeRow[]>();
  for (const node of nodes) {
    const siblings = childrenByParent.get(node.parent_id) ?? [];
    siblings.push(node);
    childrenByParent.set(node.parent_id, siblings);
  }
  const items: TreeItem[] = [];
  function visit(parentId: string | null, depth: number) {
    for (const node of childrenByParent.get(parentId) ?? []) {
      items.push({ node, depth });
      visit(node.id, depth + 1);
    }
  }
  visit(null, 0);
  return items;
}

export function KnowledgeTreePanel() {
  const nodes = useKnowledgeStore((state) => state.nodes);
  const freshNodeIds = useKnowledgeStore((state) => state.freshNodeIds);
  const anchoredNodeId = useKnowledgeStore((state) => state.anchoredNodeId);
  const toggleAnchor = useKnowledgeStore((state) => state.toggleAnchor);

  return (
    <aside className="flex h-full w-64 flex-col border-l border-stone-200 bg-white">
      <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-3">
        <span>🌳</span>
        <span className="text-sm font-medium text-stone-600">知识树</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {nodes.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs leading-relaxed text-stone-400">
            开始对话后，
            <br />
            学到的知识会在这里长成一棵树
          </p>
        ) : (
          flattenTree(nodes).map(({ node, depth }) => (
            <button
              type="button"
              key={node.id}
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
          ))
        )}
      </div>
    </aside>
  );
}
