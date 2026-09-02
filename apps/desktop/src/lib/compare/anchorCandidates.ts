/**
 * Purpose: the anchor sweep's pure-ish candidate assembly (spec 025) — turns unanchored
 * knowledge nodes plus the canonical inventory into the judge's A/B pairs, generated PER NODE
 * so the bill scales with the learner's few dozen nodes and never with the 800-concept
 * inventory. Split out of compareAlignActions.ts for the 200-line ceiling.
 * Main exports: buildAnchorCandidates, parseNodeVectors.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { parseVectorRows } from "@breadcrumb/core-db";
import {
  type AlignmentCandidatePair,
  generateAlignmentCandidates,
  type ProfileItemDefinition,
} from "@breadcrumb/feature-compare";

/** node_id -> vector, skipping every row core-db's shared embedding parse rejects. */
export function parseNodeVectors(
  rows: readonly { node_id: string; vector_json: string }[],
): Map<string, readonly number[]> {
  return parseVectorRows(rows, (row) => row.node_id);
}

/**
 * Cost direction (spec 025): candidates are generated PER NODE (top-k concepts each), not per
 * concept — the bill scales with the user's few dozen nodes, never with the 800-concept
 * inventory. Roles are swapped through the generator, then unswapped for the judge whose
 * prompt expects A = material side, B = learner side.
 */
export function buildAnchorCandidates(input: {
  openNodes: readonly KnowledgeNodeRow[];
  nodeVectors: ReadonlyMap<string, readonly number[]>;
  concepts: readonly { id: string; label: string; source_ref: string }[];
  conceptVectorById: ReadonlyMap<string, readonly number[]>;
  judgedPairs: ReadonlySet<string>;
}): AlignmentCandidatePair[] {
  const nodeItems: ProfileItemDefinition[] = input.openNodes.map((node) => ({
    key: node.id,
    parentKey: null,
    label: node.label,
    aliases: [],
    sourceRef: node.summary,
    conceptId: null,
  }));
  const conceptSide = input.concepts.map((concept) => ({
    id: concept.id,
    label: concept.label,
    summary: "",
  }));
  const conceptById = new Map(input.concepts.map((concept) => [concept.id, concept]));
  const nodeById = new Map(input.openNodes.map((node) => [node.id, node]));
  const swappedJudged = new Set(
    [...input.judgedPairs].map((pair) => {
      const [conceptId, nodeId] = pair.split(":") as [string, string];
      return `${nodeId}:${conceptId}`;
    }),
  );

  return generateAlignmentCandidates({
    items: nodeItems,
    itemVectors: input.nodeVectors,
    nodes: conceptSide,
    nodeVectors: input.conceptVectorById,
    judgedPairs: swappedJudged,
    matchedItemKeys: new Set<string>(),
  }).map((pair) => {
    const concept = conceptById.get(pair.nodeId);
    return {
      itemKey: pair.nodeId, // concept id — the judge's A side
      itemLabel: concept === undefined ? pair.nodeLabel : concept.label,
      itemContext: concept?.source_ref ?? "",
      nodeId: pair.itemKey, // node id — the judge's B side
      nodeLabel: pair.itemLabel,
      nodeSummary: nodeById.get(pair.itemKey)?.summary ?? "",
      similarity: pair.similarity,
    };
  });
}
