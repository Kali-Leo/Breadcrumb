/**
 * Purpose: pure planning logic that turns one edge-judge LLM result into concrete
 * knowledge_edges rows (and method/concept knowledge_nodes rows) to persist — resolves pair
 * ids back to node ids, applies the requires-edge cycle guard, resolves method-node
 * helpsLabels against known labels, and (casual mode, spec 016) turns adjacentConcepts
 * proposals into sighting-free concept nodes with one helps edge each (those two proposal
 * planners live in planProposals.ts). Every judged edge
 * carries the source message it was inferred from
 * into the row (migration 0048) — parsing that sentence and then discarding it was the
 * cheapest possible audit trail going to waste. No DB, no I/O.
 * Main exports: planEdgeJudgeResult, EdgeJudgePlan, JudgedPairContext,
 * ADJACENT_CONCEPT_EDGE_CONFIDENCE.
 */
import type { KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import type { EdgeJudgeResult } from "./edgeJudge";
import { HELPS_WEIGHT_SCORES } from "./edgeJudge";
import { wouldCreateCycle } from "./graph";
import { planAdjacentConcepts, planMethodNodes } from "./planProposals";

/** Fallback helps weight when the model omits the tier (shouldn't happen per prompt, but
 * keeps this function total) — a plain mid-point, deliberately not tied to an anchored tier. */
const DEFAULT_HELPS_WEIGHT = 0.5;

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
  /** The assistant message this round's judgment was made about — stored on every edge as
   * provenance. Null when the caller cannot identify one. */
  sourceMessageId: string | null;
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
    // The judge is no longer asked for a rationale — nothing ever read one off an edge, and
    // it was generated after the verdict fields, so it never informed the verdict either.
    reasoning: null,
    source_message_id: input.sourceMessageId,
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
    // The judge is no longer asked for a rationale — nothing ever read one off an edge, and
    // it was generated after the verdict fields, so it never informed the verdict either.
    reasoning: null,
    source_message_id: input.sourceMessageId,
  };
}
