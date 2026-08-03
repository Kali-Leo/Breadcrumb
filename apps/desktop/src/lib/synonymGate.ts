/**
 * Purpose: desktop-side wiring for spec 015's node-dedup synonym gate — runs strictly
 * between planNodeChanges and the store's insert loop: embed the would-be-new nodes, filter
 * by cosine similarity, ask one batched anchored verdict, and turn "同一" into a dropped
 * node + redirected sighting + alias. Any failure (no embeddings, LLM error, parse fail)
 * degrades to the pre-gate plan unchanged and records one ai_failures row — the gate must
 * never block a chat round from finishing its extraction.
 * Main exports: runSynonymGate, SynonymGateContext, SynonymGateOutcome.
 */
import type { KnowledgeNodeRow, NodeAliasRow } from "@breadcrumb/core-db";
import { chatJson, type LlmClientConfig } from "@breadcrumb/core-llm";
import {
  buildSynonymJudgeMessages,
  findSynonymCandidates,
  type NodeChangePlan,
  planSynonymGateResult,
  SYNONYM_SIMILARITY_THRESHOLD,
  type SynonymJudgePairText,
  synonymJudgeSchema,
} from "@breadcrumb/plugin-knowledge-tree";
import { getRepos } from "./db";
import { embedTexts } from "./embeddings";
import { recordAiFailure } from "./failureLog";
import { recordMeteredCall } from "./metering";
import { newId, nowIso } from "./time";

export interface SynonymGateOutcome {
  newNodes: NodeChangePlan["newNodes"];
  sightings: NodeChangePlan["sightings"];
  aliasesToInsert: NodeAliasRow[];
}

export interface SynonymGateContext {
  /** The plan planNodeChanges computed this round, before any DB insert. */
  plan: NodeChangePlan;
  /** The tree as it stood before this round — resolves existing-node labels for the prompt. */
  existingNodes: readonly KnowledgeNodeRow[];
  conversationId: string;
  sourceMessageId: string;
  config: LlmClientConfig;
}

function passthrough(plan: NodeChangePlan): SynonymGateOutcome {
  return { newNodes: plan.newNodes, sightings: plan.sightings, aliasesToInsert: [] };
}

/** Runs the gate; on any degraded path, returns the plan unchanged and records one
 * ai_failures row instead of throwing (this pipeline stage is always best-effort). */
export async function runSynonymGate(context: SynonymGateContext): Promise<SynonymGateOutcome> {
  if (context.plan.newNodes.length === 0) return passthrough(context.plan);

  try {
    const vectors = await embedTexts(
      context.plan.newNodes.map((node) => `${node.label}: ${node.summary}`),
    );
    if (vectors === null) return passthrough(context.plan); // Rust embedding unavailable

    const repos = await getRepos();
    const existingEmbeddings = await repos.nodeEmbeddings.listAll();
    const newNodeVectors = new Map(
      context.plan.newNodes.map((node, index) => [node.id, vectors[index] ?? []]),
    );
    const candidates = findSynonymCandidates(
      newNodeVectors,
      existingEmbeddings,
      SYNONYM_SIMILARITY_THRESHOLD,
    );
    if (candidates.length === 0) return passthrough(context.plan);

    const newNodeById = new Map(context.plan.newNodes.map((node) => [node.id, node]));
    const existingNodeById = new Map(context.existingNodes.map((node) => [node.id, node]));
    const pairs = candidates.map((candidate, index) => ({
      pairId: `p${index}`,
      newNodeId: candidate.newNodeId,
      existingNodeId: candidate.existingNodeId,
    }));
    const pairTexts = buildPairTexts(pairs, newNodeById, existingNodeById);
    if (pairTexts.length === 0) return passthrough(context.plan);

    const { parsed, usage } = await chatJson(
      context.config,
      buildSynonymJudgeMessages(pairTexts),
      synonymJudgeSchema,
    );
    await recordMeteredCall({
      purpose: "knowledge-tree",
      model: context.config.model,
      conversationId: context.conversationId,
      usage,
    });

    return planSynonymGateResult({
      plan: context.plan,
      pairs,
      judged: parsed,
      conversationId: context.conversationId,
      sourceMessageId: context.sourceMessageId,
      newId,
      nowIso,
    });
  } catch (error) {
    void recordAiFailure("knowledge-tree", error);
    return passthrough(context.plan);
  }
}

function buildPairTexts(
  pairs: readonly { pairId: string; newNodeId: string; existingNodeId: string }[],
  newNodeById: ReadonlyMap<string, KnowledgeNodeRow>,
  existingNodeById: ReadonlyMap<string, KnowledgeNodeRow>,
): SynonymJudgePairText[] {
  const texts: SynonymJudgePairText[] = [];
  for (const pair of pairs) {
    const newNode = newNodeById.get(pair.newNodeId);
    const existingNode = existingNodeById.get(pair.existingNodeId);
    if (newNode === undefined || existingNode === undefined) continue;
    texts.push({
      pairId: pair.pairId,
      newLabel: newNode.label,
      newSummary: newNode.summary,
      existingLabel: existingNode.label,
      existingSummary: existingNode.summary,
    });
  }
  return texts;
}
