/**
 * Purpose: lab-panel node value table — mastery (value + tier), interest aggregates
 * (curiosity/confusion/boredom) and edge counts per knowledge node. Debug-grade numbers by
 * design (spec 012); zero visual polish intended.
 * Main exports: LabNodeTable.
 */
import type { KnowledgeEdgeRow } from "@breadcrumb/core-db";
import { masteryTier } from "@breadcrumb/plugin-memory";
import { usePlannerStore } from "../stores/plannerStore";

function countEdges(nodeId: string, edges: readonly KnowledgeEdgeRow[]) {
  let outgoing = 0;
  let incoming = 0;
  for (const edge of edges) {
    if (edge.source_id === nodeId) outgoing += 1;
    if (edge.target_id === nodeId) incoming += 1;
  }
  return { outgoing, incoming };
}

export function LabNodeTable() {
  const nodes = usePlannerStore((state) => state.nodes);
  const edges = usePlannerStore((state) => state.edges);
  const masteryByNode = usePlannerStore((state) => state.masteryByNode);
  const interestScoresByNode = usePlannerStore((state) => state.interestScoresByNode);

  return (
    <section>
      <h3 className="mb-1 font-semibold text-stone-600">节点数值表</h3>
      {nodes.length === 0 ? (
        <p className="text-stone-400">还没有知识点，去对话里学点什么就会出现在这里。</p>
      ) : (
        <div className="max-h-64 overflow-auto rounded border border-stone-200">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-stone-100">
              <tr>
                <th className="px-2 py-1">节点</th>
                <th className="px-2 py-1">掌握度</th>
                <th className="px-2 py-1">好奇/困惑/厌倦</th>
                <th className="px-2 py-1">出/入边</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((node) => {
                const mastery = masteryByNode.get(node.id) ?? 0;
                const interest = interestScoresByNode.get(node.id);
                const { outgoing, incoming } = countEdges(node.id, edges);
                return (
                  <tr key={node.id} className="border-t border-stone-100">
                    <td className="px-2 py-1">{node.label}</td>
                    <td className="px-2 py-1">
                      {mastery.toFixed(2)} · {masteryTier(mastery)}
                    </td>
                    <td className="px-2 py-1">
                      {(interest?.curiosity ?? 0).toFixed(2)} /{" "}
                      {(interest?.confusion ?? 0).toFixed(2)} /{" "}
                      {(interest?.boredom ?? 0).toFixed(2)}
                    </td>
                    <td className="px-2 py-1">
                      {outgoing} / {incoming}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
