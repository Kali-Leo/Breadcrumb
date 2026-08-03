/**
 * Purpose: pure planning logic that turns one edge-judge LLM result into concrete
 * knowledge_edges rows (and method knowledge_nodes rows) to persist — resolves pair ids
 * back to node ids, applies the requires-edge cycle guard, and resolves method-node
 * helpsLabels against known labels. No DB, no I/O.
 * Main exports: planEdgeJudgeResult, EdgeJudgePlan, JudgedPairContext.
 */
import type { KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import type { EdgeJudgeResult } from "./edgeJudge";
import { HELPS_WEIGHT_SCORES } from "./edgeJudge";
import { wouldCreateCycle } from "./graph";

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
  return {
    edgesToUpsert: [...edgesToUpsert, ...methodEdges],
    methodNodesToInsert,
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
