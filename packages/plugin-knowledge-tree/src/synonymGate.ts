/**
 * Purpose: spec 015's node-dedup synonym gate — pure logic only. Filters would-be-new nodes
 * against existing nodes by embedding cosine similarity (findSynonymCandidates), the
 * anchored same/different LLM contract for the survivors (synonymJudgeSchema,
 * buildSynonymJudgeMessages), and the plan adjustment once verdicts come back
 * (planSynonymGateResult): "同一" drops the new node, redirects its footprint to the
 * existing node, and records an alias; "不同" leaves the original plan untouched.
 * Main exports: SYNONYM_SIMILARITY_THRESHOLD, findSynonymCandidates, SynonymCandidatePair,
 * synonymJudgeSchema, buildSynonymJudgeMessages, SynonymJudgePairText, planSynonymGateResult,
 * SynonymGatePlan, JudgedSynonymPair.
 */
import type {
  KnowledgeNodeRow,
  NodeAliasRow,
  NodeEmbeddingRow,
  NodeSightingRow,
} from "@breadcrumb/core-db";
import type { ChatMessage } from "@breadcrumb/core-llm";
import { z } from "zod";
import type { NodeChangePlan } from "./attach";

/** Cosine-similarity floor a would-be-new node's single best existing match must clear
 * before it even enters LLM judgment — below this, two concepts are assumed unrelated and
 * the gate costs nothing (spec 015, tuned via plugin-knowledge-tree/productParams). */
export const SYNONYM_SIMILARITY_THRESHOLD = 0.85;

export interface SynonymCandidatePair {
  newNodeId: string;
  existingNodeId: string;
  similarity: number;
}

/** For each new node's embedding, its single best-matching existing node by cosine
 * similarity — kept only when it clears `threshold`. Pure math, no DB. */
export function findSynonymCandidates(
  newNodeVectors: ReadonlyMap<string, readonly number[]>,
  existingEmbeddings: readonly NodeEmbeddingRow[],
  threshold: number,
): SynonymCandidatePair[] {
  const candidates: SynonymCandidatePair[] = [];
  for (const [newNodeId, newVector] of newNodeVectors) {
    let best: { existingNodeId: string; similarity: number } | null = null;
    for (const existing of existingEmbeddings) {
      const existingVector = JSON.parse(existing.vector_json) as number[];
      const similarity = cosineSimilarity(newVector, existingVector);
      if (best === null || similarity > best.similarity) {
        best = { existingNodeId: existing.node_id, similarity };
      }
    }
    if (best !== null && best.similarity >= threshold) {
      candidates.push({
        newNodeId,
        existingNodeId: best.existingNodeId,
        similarity: best.similarity,
      });
    }
  }
  return candidates;
}

// Cosine helper, exported for in-package reuse (suspectPairs.ts) — mirrors
// plugin-graph/src/similarity.ts and plugin-interest/src/spread.ts's own local copies
// rather than adding a cross-package dep for this one piece of math.
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  const length = Math.min(a.length, b.length);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < length; index += 1) {
    const valueA = a[index] ?? 0;
    const valueB = b[index] ?? 0;
    dotProduct += valueA * valueB;
    normA += valueA * valueA;
    normB += valueB * valueB;
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Anchored verdict tier (spec 014 style): the model picks one of two labeled outcomes
 * instead of a bare boolean, for cross-call consistency. */
export const synonymVerdictSchema = z.enum(["同一", "不同"]);
export type SynonymVerdict = z.infer<typeof synonymVerdictSchema>;

export const synonymJudgeSchema = z.object({
  verdicts: z
    .array(
      z.object({
        pairId: z.string().min(1),
        verdict: synonymVerdictSchema,
      }),
    )
    .max(20),
});

export type SynonymJudgeResult = z.infer<typeof synonymJudgeSchema>;

export interface SynonymJudgePairText {
  /** Opaque, stable per batch (e.g. "p0") so the model can echo it back unambiguously. */
  pairId: string;
  newLabel: string;
  newSummary: string;
  existingLabel: string;
  existingSummary: string;
}

const SYSTEM_PROMPT = `你是一个概念查重器。给定若干候选对，每对是「新概念」与「已有节点」，判断新概念是否只是已有节点的另一种说法，以 JSON 返回：
{"verdicts":[{"pairId":"候选对编号(原样返回)","verdict":"同一|不同"}]}
判定规则：
- 同一：新概念和已有节点讲的是同一件事，只是措辞、角度或详略不同
- 不同：新概念虽然相关但确实是独立的知识点，值得单独成节点`;

export function buildSynonymJudgeMessages(pairs: readonly SynonymJudgePairText[]): ChatMessage[] {
  const pairsText = pairs
    .map(
      (pair) =>
        `[${pair.pairId}] 新概念「${pair.newLabel}」(${pair.newSummary}) vs 已有节点「${pair.existingLabel}」(${pair.existingSummary})`,
    )
    .join("\n");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `候选对：\n${pairsText}` },
  ];
}

export interface JudgedSynonymPair {
  pairId: string;
  newNodeId: string;
  existingNodeId: string;
}

export interface SynonymGatePlanInput {
  /** The plan computed by planNodeChanges, before insert. */
  plan: NodeChangePlan;
  pairs: readonly JudgedSynonymPair[];
  judged: SynonymJudgeResult;
  conversationId: string;
  sourceMessageId: string | null;
  newId(): string;
  nowIso(): string;
}

export interface SynonymGatePlan {
  /** plan.newNodes with every "同一"-verdict node removed. */
  newNodes: KnowledgeNodeRow[];
  /** plan.sightings with dropped nodes' sightings redirected to their existing match
   * (deduped — still at most one footprint per concept per round). */
  sightings: NodeSightingRow[];
  /** One alias row per dropped node: its label now resolves straight to the existing node. */
  aliasesToInsert: NodeAliasRow[];
}

/** Turns the synonym-judge LLM result into the final insert plan. A judgment with an
 * unknown pairId, or "不同", changes nothing for that pair — the original plan wins. */
export function planSynonymGateResult(input: SynonymGatePlanInput): SynonymGatePlan {
  const pairById = new Map(input.pairs.map((pair) => [pair.pairId, pair]));
  const existingNodeIdByDroppedNewNodeId = new Map<string, string>();
  for (const verdict of input.judged.verdicts) {
    if (verdict.verdict !== "同一") continue;
    const pair = pairById.get(verdict.pairId);
    if (pair === undefined) continue;
    existingNodeIdByDroppedNewNodeId.set(pair.newNodeId, pair.existingNodeId);
  }

  if (existingNodeIdByDroppedNewNodeId.size === 0) {
    return { newNodes: input.plan.newNodes, sightings: input.plan.sightings, aliasesToInsert: [] };
  }

  const droppedNodes = input.plan.newNodes.filter((node) =>
    existingNodeIdByDroppedNewNodeId.has(node.id),
  );
  const newNodes = input.plan.newNodes.filter(
    (node) => !existingNodeIdByDroppedNewNodeId.has(node.id),
  );

  const sightings = input.plan.sightings.filter(
    (sighting) => !existingNodeIdByDroppedNewNodeId.has(sighting.node_id),
  );
  const sightedNodeIds = new Set(sightings.map((sighting) => sighting.node_id));
  for (const existingNodeId of new Set(existingNodeIdByDroppedNewNodeId.values())) {
    if (sightedNodeIds.has(existingNodeId)) continue; // one footprint per concept per round
    sightedNodeIds.add(existingNodeId);
    sightings.push({
      id: input.newId(),
      node_id: existingNodeId,
      conversation_id: input.conversationId,
      message_id: input.sourceMessageId,
      created_at: input.nowIso(),
    });
  }

  const aliasesToInsert: NodeAliasRow[] = droppedNodes.map((node) => ({
    alias_label: node.label,
    node_id: existingNodeIdByDroppedNewNodeId.get(node.id) as string,
    created_at: input.nowIso(),
  }));

  return { newNodes, sightings, aliasesToInsert };
}
