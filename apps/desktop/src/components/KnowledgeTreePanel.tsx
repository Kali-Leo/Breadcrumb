/**
 * Purpose: right column with two views — 本次足迹 (this conversation's trail, walking
 * order) and 我的知识树 (the user's whole tree, hierarchical). Click any node to anchor.
 * Main exports: KnowledgeTreePanel.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { useState } from "react";
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

function NodeButton({ node, depth }: { node: KnowledgeNodeRow; depth: number }) {
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

export function KnowledgeTreePanel() {
  const [view, setView] = useState<"trail" | "tree">("trail");
  const nodes = useKnowledgeStore((state) => state.nodes);
  const sessionNodeIds = useKnowledgeStore((state) => state.sessionNodeIds);

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const sessionNodes = sessionNodeIds
    .map((nodeId) => nodeById.get(nodeId))
    .filter((node): node is KnowledgeNodeRow => node !== undefined);

  const tabClass = (active: boolean) =>
    `flex-1 rounded-lg px-2 py-1 text-xs transition-colors ${
      active ? "bg-amber-100 text-stone-700" : "text-stone-400 hover:bg-stone-50"
    }`;

  return (
    <aside className="flex h-full w-64 flex-col border-l border-stone-200 bg-white">
      <div className="flex gap-1 border-b border-stone-100 p-2">
        <button
          type="button"
          onClick={() => setView("trail")}
          className={tabClass(view === "trail")}
        >
          🍞 本次足迹
        </button>
        <button type="button" onClick={() => setView("tree")} className={tabClass(view === "tree")}>
          🌳 我的知识树
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {view === "trail" ? (
          sessionNodes.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs leading-relaxed text-stone-400">
              这次对话踩过的知识点
              <br />
              会按脚步顺序出现在这里
            </p>
          ) : (
            sessionNodes.map((node) => <NodeButton key={node.id} node={node} depth={0} />)
          )
        ) : nodes.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs leading-relaxed text-stone-400">
            你学到的一切
            <br />
            会在这里长成一棵属于你的树
          </p>
        ) : (
          flattenTree(nodes).map(({ node, depth }) => (
            <NodeButton key={node.id} node={node} depth={depth} />
          ))
        )}
      </div>
    </aside>
  );
}
