/**
 * Purpose: spec 015's node-dedup synonym gate — pure logic only. Filters would-be-new nodes
 * against existing nodes by embedding cosine similarity (findSynonymCandidates), the
 * anchored same/different LLM contract for the survivors (synonymJudgeSchema,
 * buildSynonymJudgeMessages), and the plan adjustment once verdicts come back
 * (planSynonymGateResult): "same" drops the new node, redirects its footprint to the
 * existing node, and records an alias; "different" leaves the original plan untouched.
 * Main exports: SYNONYM_CANDIDATE_TOP_K, findSynonymCandidates, SynonymCandidatePair,
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
import { cosineSimilarity, topByRelativeGate } from "./similarityGate";

/** At most this many existing nodes per would-be-new node reach LLM judgment. Top-1 was the
 * old rule; in a space where every true pair sits between 0.80 and 0.95 a real synonym lands
 * second or third routinely, and that miss was silent and unrecorded (design audit
 * 2026-08-28 #8). Same k the alignment layer already used. */
export const SYNONYM_CANDIDATE_TOP_K = 3;

export interface SynonymCandidatePair {
  newNodeId: string;
  existingNodeId: string;
  similarity: number;
}

/** For each new node's embedding, the existing nodes that stand out in ITS OWN similarity
 * landscape (relativeGate), most similar first, at most SYNONYM_CANDIDATE_TOP_K of them.
 * Pure math, no DB. Every stored vector is parsed exactly once, outside the per-new-node
 * loop — it used to be re-parsed for every (new, existing) combination. */
export function findSynonymCandidates(
  newNodeVectors: ReadonlyMap<string, readonly number[]>,
  existingEmbeddings: readonly NodeEmbeddingRow[],
  topK: number = SYNONYM_CANDIDATE_TOP_K,
): SynonymCandidatePair[] {
  const existingVectors: { existingNodeId: string; vector: number[] }[] = [];
  for (const existing of existingEmbeddings) {
    existingVectors.push({
      existingNodeId: existing.node_id,
      vector: JSON.parse(existing.vector_json) as number[],
    });
  }

  const candidates: SynonymCandidatePair[] = [];
  for (const [newNodeId, newVector] of newNodeVectors) {
    const scored = existingVectors.map((existing) => ({
      newNodeId,
      existingNodeId: existing.existingNodeId,
      similarity: cosineSimilarity(newVector, existing.vector),
    }));
    candidates.push(...topByRelativeGate(scored, topK));
  }
  return candidates;
}

/** Anchored verdict tier (spec 014 style): the model picks one of two labeled outcomes
 * instead of a bare boolean, for cross-call consistency. ASCII values (design audit
 * 2026-08-28, 多语言 B6): the enum travels inside a JSON contract the model is separately
 * told to answer in the learner's language, so Chinese literals here fight that directive. */
export const synonymVerdictSchema = z.enum(["same", "different"]);
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

// "拿不准就判 different" is not politeness — a "same" verdict here irreversibly deletes a
// node and folds its history away, while a "different" verdict costs nothing but one extra
// node. The alignment judge (plugin-compare/src/alignment.ts) has always carried this
// abstention line; the judge that actually destroys data did not (design audit 2026-08-28 #8).
const SYSTEM_PROMPT = `你是一个概念查重器。给定若干候选对，每对是「新概念」与「已有节点」，判断新概念是否只是已有节点的另一种说法，以 JSON 返回：
{"verdicts":[{"pairId":"候选对编号(原样返回)","verdict":"same|different"}]}
判定规则：
- same：新概念和已有节点讲的是同一件事，只是措辞、角度或详略不同
- different：新概念虽然相关但确实是独立的知识点，值得单独成节点
- 仅仅相关、一个是另一个的组成部分、上位或下位概念，都判 different
- 拿不准就判 different`;

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
 * unknown pairId, or "different", changes nothing for that pair — the original plan wins.
 * With top-3 candidates a new node can appear in several pairs; the first "same" verdict
 * wins and later ones for the same new node are ignored (Map.set order), so a node is never
 * folded into two different existing nodes at once. */
export function planSynonymGateResult(input: SynonymGatePlanInput): SynonymGatePlan {
  const pairById = new Map(input.pairs.map((pair) => [pair.pairId, pair]));
  const existingNodeIdByDroppedNewNodeId = new Map<string, string>();
  for (const verdict of input.judged.verdicts) {
    if (verdict.verdict !== "same") continue;
    const pair = pairById.get(verdict.pairId);
    if (pair === undefined) continue;
    if (existingNodeIdByDroppedNewNodeId.has(pair.newNodeId)) continue;
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
      // Filled in by the caller (knowledgeStore.ts) with the round's anchored node (spec 040 §7).
      origin_node_id: null,
    });
  }

  const aliasesToInsert: NodeAliasRow[] = droppedNodes.map((node) => ({
    alias_label: node.label,
    node_id: existingNodeIdByDroppedNewNodeId.get(node.id) as string,
    created_at: input.nowIso(),
  }));

  return { newNodes, sightings, aliasesToInsert };
}
