/**
 * Purpose: replays apps/desktop/src/lib/synonymGate.ts's node-dedup gate (spec 015) inside
 * the knowledge-tree pipeline stage — synthetic-embedding-filtered candidates against
 * existing nodes, one batched anchored LLM verdict, and plan adjustment. Deliberate
 * divergence from production: computeSyntheticNodeEmbedding is synchronous and can't fail,
 * so this stage never exercises the app's "no local embedding model" degraded branch.
 * Main exports: runSynonymGateStage, GatedNodeChangePlan.
 */
import { randomUUID } from "node:crypto";
import type { KnowledgeNodeRow, NodeAliasRow } from "@breadcrumb/core-db";
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildSynonymJudgeMessages,
  findSynonymCandidates,
  type NodeChangePlan,
  planSynonymGateResult,
  SYNONYM_SIMILARITY_THRESHOLD,
  type SynonymJudgePairText,
  synonymJudgeSchema,
} from "@breadcrumb/plugin-knowledge-tree";
import { computeSyntheticNodeEmbedding } from "../embedding/syntheticEmbedding";
import { describeError, type PipelineFailure, type RoundPipelineInput } from "./pipelineTypes";

export interface GatedNodeChangePlan extends NodeChangePlan {
  aliasesToInsert: NodeAliasRow[];
}

function passthrough(plan: NodeChangePlan): GatedNodeChangePlan {
  return { ...plan, aliasesToInsert: [] };
}

/** Runs the gate; on any failure, returns `plan` unchanged and records a "knowledge-tree"
 * pipeline failure — the gate must never block node persistence. */
export async function runSynonymGateStage(
  input: RoundPipelineInput,
  plan: NodeChangePlan,
  existingNodes: readonly KnowledgeNodeRow[],
  failures: PipelineFailure[],
): Promise<GatedNodeChangePlan> {
  if (plan.newNodes.length === 0) return passthrough(plan);
  const { repos, llmConfig } = input;

  try {
    const existingEmbeddings = await repos.nodeEmbeddings.listAll();
    const newNodeVectors = new Map(
      plan.newNodes.map((node): [string, number[]] => [
        node.id,
        computeSyntheticNodeEmbedding(node.label, node.summary),
      ]),
    );
    const candidates = findSynonymCandidates(
      newNodeVectors,
      existingEmbeddings,
      SYNONYM_SIMILARITY_THRESHOLD,
    );
    if (candidates.length === 0) return passthrough(plan);

    const newNodeById = new Map(plan.newNodes.map((node) => [node.id, node]));
    const existingNodeById = new Map(existingNodes.map((node) => [node.id, node]));
    const pairs = candidates.map((candidate, index) => ({
      pairId: `p${index}`,
      newNodeId: candidate.newNodeId,
      existingNodeId: candidate.existingNodeId,
    }));
    const pairTexts = pairs
      .map((pair): SynonymJudgePairText | null => {
        const newNode = newNodeById.get(pair.newNodeId);
        const existingNode = existingNodeById.get(pair.existingNodeId);
        if (newNode === undefined || existingNode === undefined) return null;
        return {
          pairId: pair.pairId,
          newLabel: newNode.label,
          newSummary: newNode.summary,
          existingLabel: existingNode.label,
          existingSummary: existingNode.summary,
        };
      })
      .filter((pair): pair is SynonymJudgePairText => pair !== null);
    if (pairTexts.length === 0) return passthrough(plan);

    const messages = buildSynonymJudgeMessages(pairTexts);
    const { parsed, usage } = await chatJson(llmConfig, messages, synonymJudgeSchema);
    input.recordCall("knowledge-tree", llmConfig.model, usage);
    input.logStage({ purpose: "knowledge-tree", request: messages, response: parsed });

    return planSynonymGateResult({
      plan,
      pairs,
      judged: parsed,
      conversationId: input.conversationId,
      sourceMessageId: input.answerMessageId,
      newId: () => randomUUID(),
      nowIso: () => input.nowIso,
    });
  } catch (error) {
    const message = describeError(error);
    failures.push({ purpose: "knowledge-tree", error: message });
    input.logStage({ purpose: "knowledge-tree", error: message });
    return passthrough(plan);
  }
}
