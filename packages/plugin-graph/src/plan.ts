/**
 * Purpose: pure planning logic that turns one edge-judge LLM result into concrete
 * knowledge_edges rows (and method/concept knowledge_nodes rows) to persist — resolves pair
 * ids back to node ids, applies the requires-edge cycle guard, resolves method-node
 * helpsLabels against known labels, and (casual mode, spec 016) turns adjacentConcepts
 * proposals into sighting-free concept nodes with one helps edge each. No DB, no I/O.
 * Main exports: planEdgeJudgeResult, EdgeJudgePlan, JudgedPairContext.
 */
import type { KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import type { EdgeJudgeResult } from "./edgeJudge";
import { HELPS_WEIGHT_SCORES } from "./edgeJudge";
import { wouldCreateCycle } from "./graph";

/** Fallback helps weight when the model omits the tier (shouldn't happen per prompt, but
 * keeps this function total) — a plain mid-point, deliberately not tied to an anchored tier. */
const DEFAULT_HELPS_WEIGHT = 0.5;

/** Adjacent-concept proposals (spec 016) carry no separate confidence tier — helpsLevel is
 * the only judgment asked of the model for these. A fixed mid confidence keeps the edge from
 * silently outweighing an explicitly-judged helps edge without inventing an ungrounded number. */
const ADJACENT_CONCEPT_EDGE_CONFIDENCE = 0.6;

export interface JudgedPairContext {
  pairId: string;
  nodeAId: string;
  nodeBId: string;
}

export interface EdgeJudgePlanInput {
  judged: EdgeJudgeResult;
  pairs: readonly JudgedPairContext[];
  /** Every edge already in the DB — used for the cycle guard, and grown in-plan so two
   * requires edges accepted from the same batch can't jointly form a cycle. */
  existingEdges: readonly KnowledgeEdgeRow[];
  /** label -> node id, for resolving method-node helpsLabels. */
  nodeIdByLabel: ReadonlyMap<string, string>;
  newId(): string;
  nowIso(): string;
}

export interface RejectedCyclicEdge {
  source_id: string;
  target_id: string;
}

export interface EdgeJudgePlan {
  edgesToUpsert: KnowledgeEdgeRow[];
  methodNodesToInsert: KnowledgeNodeRow[];
  /** Casual-mode adjacent-concept proposals (spec 016) turned into concept nodes — the
   * caller must insert these WITHOUT a node_sightings row, so they stay genuinely unlit and
   * give frontier() a real "ahead". Their helps edges are already included in edgesToUpsert. */
  conceptNodesToInsert: KnowledgeNodeRow[];
  /** requires edges the model proposed but were dropped because they would create a cycle. */
  rejectedCyclicEdges: RejectedCyclicEdge[];
}

export function planEdgeJudgeResult(input: EdgeJudgePlanInput): EdgeJudgePlan {
  const pairById = new Map(input.pairs.map((pair) => [pair.pairId, pair]));
  const edgesToUpsert: KnowledgeEdgeRow[] = [];
  const rejectedCyclicEdges: RejectedCyclicEdge[] = [];
  let workingEdges = [...input.existingEdges];

  for (const judged of input.judged.edges) {
    if (judged.relation === "unrelated") continue;
    const pair = pairById.get(judged.pairId);
    if (pair === undefined) continue;

    const edge =
      judged.relation === "requires"
        ? planRequiresEdge(judged, pair, workingEdges, input, rejectedCyclicEdges)
        : planHelpsEdge(judged, pair, input);
    if (edge === null) continue;
    edgesToUpsert.push(edge);
    workingEdges = [...workingEdges, edge];
  }

  const { methodNodesToInsert, methodEdges } = planMethodNodes(input);
  const { conceptNodesToInsert, conceptEdges } = planAdjacentConcepts(input);
  return {
    edgesToUpsert: [...edgesToUpsert, ...methodEdges, ...conceptEdges],
    methodNodesToInsert,
    conceptNodesToInsert,
    rejectedCyclicEdges,
  };
}

function planRequiresEdge(
  judged: EdgeJudgeResult["edges"][number],
  pair: JudgedPairContext,
  workingEdges: readonly KnowledgeEdgeRow[],
  input: EdgeJudgePlanInput,
  rejectedCyclicEdges: RejectedCyclicEdge[],
): KnowledgeEdgeRow | null {
  const source_id = judged.direction === "bToA" ? pair.nodeBId : pair.nodeAId;
  const target_id = judged.direction === "bToA" ? pair.nodeAId : pair.nodeBId;
  if (wouldCreateCycle(workingEdges, { source_id, target_id })) {
    rejectedCyclicEdges.push({ source_id, target_id });
    return null;
  }
  return {
    id: input.newId(),
    source_id,
    target_id,
    edge_type: "requires",
    weight: 1,
    confidence: judged.confidence,
    origin: "llm",
    created_at: input.nowIso(),
  };
}

function planHelpsEdge(
  judged: EdgeJudgeResult["edges"][number],
  pair: JudgedPairContext,
  input: EdgeJudgePlanInput,
): KnowledgeEdgeRow {
  return {
    id: input.newId(),
    source_id: pair.nodeAId,
    target_id: pair.nodeBId,
    edge_type: "helps",
    weight: judged.weight !== null ? HELPS_WEIGHT_SCORES[judged.weight] : DEFAULT_HELPS_WEIGHT,
    confidence: judged.confidence,
    origin: "llm",
    created_at: input.nowIso(),
  };
}

function planMethodNodes(input: EdgeJudgePlanInput): {
  methodNodesToInsert: KnowledgeNodeRow[];
  methodEdges: KnowledgeEdgeRow[];
} {
  const methodNodesToInsert: KnowledgeNodeRow[] = [];
  const methodEdges: KnowledgeEdgeRow[] = [];
  let nodeIdByLabel = new Map(input.nodeIdByLabel);

  for (const proposal of input.judged.methodNodes) {
    const targetIds = proposal.helpsLabels
      .map((label) => nodeIdByLabel.get(label))
      .filter((id): id is string => id !== undefined);
    if (targetIds.length === 0) continue; // nothing to attach to — skip creating an orphan
    const methodNode: KnowledgeNodeRow = {
      id: input.newId(),
      parent_id: null,
      label: proposal.label,
      summary: proposal.summary,
      kind: "method",
      created_at: input.nowIso(),
    };
    methodNodesToInsert.push(methodNode);
    nodeIdByLabel = new Map(nodeIdByLabel).set(methodNode.label, methodNode.id);
    for (const targetId of targetIds) {
      methodEdges.push({
        id: input.newId(),
        source_id: methodNode.id,
        target_id: targetId,
        edge_type: "helps",
        weight: HELPS_WEIGHT_SCORES[proposal.weight],
        confidence: proposal.confidence,
        origin: "llm",
        created_at: input.nowIso(),
      });
    }
  }
  return { methodNodesToInsert, methodEdges };
}

/** Casual-mode adjacent-concept proposals (spec 016) -> sighting-free concept nodes plus one
 * helps edge each, from the concept they connect to. Guards: a proposal whose label already
 * names a known node is skipped (it isn't actually unlearned/new); a proposal whose
 * connectsToLabel doesn't resolve to any known node is skipped (nothing to attach to); two
 * proposals in the same batch that repeat the same label only produce one node (dup guard).
 * No cycle guard needed — these edges are always 'helps', which isn't cycle-constrained
 * (see graph.ts's wouldCreateCycle, requires-only). */
function planAdjacentConcepts(input: EdgeJudgePlanInput): {
  conceptNodesToInsert: KnowledgeNodeRow[];
  conceptEdges: KnowledgeEdgeRow[];
} {
  const conceptNodesToInsert: KnowledgeNodeRow[] = [];
  const conceptEdges: KnowledgeEdgeRow[] = [];
  const knownLabels = new Set(input.nodeIdByLabel.keys());

  for (const proposal of input.judged.adjacentConcepts) {
    if (knownLabels.has(proposal.label)) continue; // not actually new — skip the proposal
    const connectsToId = input.nodeIdByLabel.get(proposal.connectsToLabel);
    if (connectsToId === undefined) continue; // nothing to attach to — skip

    const conceptNode: KnowledgeNodeRow = {
      id: input.newId(),
      parent_id: null,
      label: proposal.label,
      summary: proposal.summary,
      kind: "concept",
      created_at: input.nowIso(),
    };
    conceptNodesToInsert.push(conceptNode);
    knownLabels.add(conceptNode.label);
    conceptEdges.push({
      id: input.newId(),
      source_id: connectsToId,
      target_id: conceptNode.id,
      edge_type: "helps",
      weight: HELPS_WEIGHT_SCORES[proposal.helpsLevel],
      confidence: ADJACENT_CONCEPT_EDGE_CONFIDENCE,
      origin: "llm",
      created_at: input.nowIso(),
    });
  }
  return { conceptNodesToInsert, conceptEdges };
}
