/**
 * Purpose: renders an ExplorationAtlas as symbolic structured text (spec 039 §2.4) — the
 * first-cut presentation, judged solely by logical clarity; no route-map visuals yet. All
 * copy is plain statement (product principle 1: no praise, no pressure, no "wasted"/"wrong").
 * Main exports: renderAtlasText.
 */

import type { KnowledgeEdgeRow } from "@breadcrumb/core-db";
import type { AtlasDetour, AtlasFrontierItem, AtlasNode, ExplorationAtlas } from "./atlas";

const NO_FOOTPRINTS_TEXT = "这次还没有留下足迹。";

function edgeSymbol(edgeType: "requires" | "helps"): string {
  return edgeType === "requires" ? "→" : "⇢";
}

/** "本次走过 N 站：" plus the trail chain, connected by the edge symbol when a direct edge
 * exists between trail-adjacent nodes, otherwise a neutral "·". */
function renderTrailSection(atlas: ExplorationAtlas): string {
  const header = `本次走过 ${atlas.trail.length} 站：`;
  const parts = atlas.trail.map((node) => `● ${node.label}`);
  let chain = parts[0] ?? "";
  for (let index = 1; index < atlas.trail.length; index += 1) {
    const previous = atlas.trail[index - 1] as AtlasNode;
    const current = atlas.trail[index] as AtlasNode;
    const edge = atlas.structure.find(
      (candidate) =>
        (candidate.source_id === previous.nodeId && candidate.target_id === current.nodeId) ||
        (candidate.source_id === current.nodeId && candidate.target_id === previous.nodeId),
    );
    const connector = edge === undefined ? "·" : edgeSymbol(edge.edge_type);
    chain += ` ${connector} ${parts[index]}`;
  }
  return `${header}\n${chain}`;
}

/** One line per backfilled prerequisite: the dependent was met first, the prerequisite later. */
function renderBackfillSection(
  detours: readonly AtlasDetour[],
  labelByNode: ReadonlyMap<string, string>,
): string {
  const lines = detours.map((detour) => {
    const nodeLabel = labelByNode.get(detour.nodeId) ?? detour.nodeId;
    const relatedLabel =
      detour.relatedNodeId !== null
        ? (labelByNode.get(detour.relatedNodeId) ?? detour.relatedNodeId)
        : "";
    return `↩ ${nodeLabel} ——你先遇到 ${relatedLabel}，后来回头补了它的前置 ${nodeLabel}`;
  });
  return ["回头补的前置：", ...lines].join("\n");
}

/** Revisits are condensed to a single restrained line — the detour is a fact, not a story. */
function renderRevisitSection(
  detours: readonly AtlasDetour[],
  labelByNode: ReadonlyMap<string, string>,
): string {
  const bullets = detours
    .map((detour) => `● ${labelByNode.get(detour.nodeId) ?? detour.nodeId}`)
    .join("、");
  return `走了回头路的站：${bullets}`;
}

function renderUnusedLinksSection(
  edges: readonly KnowledgeEdgeRow[],
  labelByNode: ReadonlyMap<string, string>,
): string {
  const lines = edges.map((edge) => {
    const sourceLabel = labelByNode.get(edge.source_id) ?? edge.source_id;
    const targetLabel = labelByNode.get(edge.target_id) ?? edge.target_id;
    return `● ${sourceLabel} ${edgeSymbol(edge.edge_type)} ● ${targetLabel} ——这两站之间还有一条没走过的路`;
  });
  return ["没走的联结：", ...lines].join("\n");
}

function renderFrontierSection(
  items: readonly AtlasFrontierItem[],
  labelByNode: ReadonlyMap<string, string>,
): string {
  const lines = items.map((item) => {
    const viaLabel = labelByNode.get(item.viaNodeId) ?? item.viaNodeId;
    if (item.edgeType === "requires") {
      return item.isPrerequisiteOfVisited
        ? `○ ${item.label} ——它是你走过的 ${viaLabel} 的前置`
        : `○ ${item.label} ——它的前置正是你走过的 ${viaLabel}`;
    }
    return `○ ${item.label} ——你走过的 ${viaLabel} 对它有帮助`;
  });
  return ["相邻的未访之地：", ...lines].join("\n");
}

function renderStalenessSection(nodes: readonly AtlasNode[]): string {
  const lines = nodes.map((node) => `● ${node.label}`);
  return ["生疏的老朋友：", ...lines].join("\n");
}

/** Renders the atlas as symbol-annotated structured text; empty atlases get one plain line. */
export function renderAtlasText(atlas: ExplorationAtlas): string {
  if (atlas.trail.length === 0) return NO_FOOTPRINTS_TEXT;

  const labelByNode = new Map(atlas.trail.map((node) => [node.nodeId, node.label]));
  const sections: string[] = [renderTrailSection(atlas)];

  const backfillDetours = atlas.detours.filter((detour) => detour.kind === "backfill");
  if (backfillDetours.length > 0)
    sections.push(renderBackfillSection(backfillDetours, labelByNode));

  const revisitDetours = atlas.detours.filter((detour) => detour.kind === "revisit");
  if (revisitDetours.length > 0) sections.push(renderRevisitSection(revisitDetours, labelByNode));

  if (atlas.unusedLinks.length > 0) {
    sections.push(renderUnusedLinksSection(atlas.unusedLinks, labelByNode));
  }

  if (atlas.frontier.length > 0) sections.push(renderFrontierSection(atlas.frontier, labelByNode));

  if (atlas.staleness.length > 0) sections.push(renderStalenessSection(atlas.staleness));

  return sections.join("\n\n");
}
