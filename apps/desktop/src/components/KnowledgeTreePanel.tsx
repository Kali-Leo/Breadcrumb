/**
 * Purpose: right column with three tabs — 本次足迹 (this conversation's trail, walking
 * order), 我的知识树 (the user's whole tree, hierarchical) and 🧪 实验室 (spec 012's
 * temporary planner panel, labPanel-switch gated). Click any node to anchor.
 * Main exports: KnowledgeTreePanel.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { useState } from "react";
import { useKnowledgeStore } from "../stores/knowledgeStore";
import { useSettingsStore } from "../stores/settingsStore";
import { LabPanel } from "./LabPanel";

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
  const [view, setView] = useState<"trail" | "tree" | "lab">("trail");
  const labPanelEnabled = useSettingsStore((state) => state.featureSwitches.labPanel);
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
    <aside
      className={`flex h-full flex-col border-l border-stone-200 bg-white transition-[width] ${
        view === "lab" ? "w-[28rem]" : "w-64"
      }`}
    >
      <div className="flex gap-1 border-b border-stone-100 p-2">
        <button
          type="button"
          onClick={() => setView("trail")}
          className={tabClass(view === "trail")}
        >
          🍞 本次足迹
        </button>
        <button type="button" onClick={() => setView("tree")} className={tabClass(view === "tree")}>
          🧭 知识导航
        </button>
        <button type="button" onClick={() => setView("lab")} className={tabClass(view === "lab")}>
          🧪 实验室
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {view === "trail" &&
          (sessionNodes.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs leading-relaxed text-stone-400">
              这次对话踩过的知识点
              <br />
              会按脚步顺序出现在这里
            </p>
          ) : (
            sessionNodes.map((node) => <NodeButton key={node.id} node={node} depth={0} />)
          ))}
        {view === "tree" &&
          (nodes.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs leading-relaxed text-stone-400">
              你学过的知识点
              <br />
              会在这里形成一份可导航的目录
            </p>
          ) : (
            flattenTree(nodes).map(({ node, depth }) => (
              <NodeButton key={node.id} node={node} depth={depth} />
            ))
          ))}
        {view === "lab" &&
          (labPanelEnabled ? (
            <LabPanel />
          ) : (
            <p className="px-2 py-6 text-center text-xs leading-relaxed text-stone-400">
              🧪 实验室面板还没打开
              <br />
              去设置里开启「实验室面板」开关就能看到啦
            </p>
          ))}
      </div>
      {view !== "lab" && (
        <p className="border-t border-stone-100 px-3 py-2 text-[11px] leading-relaxed text-stone-400">
          💡 点击任意知识点可<span className="text-amber-600">锚定</span>
          ，让接下来的对话围绕它展开
        </p>
      )}
    </aside>
  );
}
