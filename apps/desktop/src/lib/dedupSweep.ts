/**
 * Purpose: startup auto-merge sweep for spec 015 #4 — mechanically merges normalized-label
 * duplicate nodes (always, zero LLM), then asks the synonym-judge LLM about up to 10
 * embedding-similar existing-node pairs and merges every "同一" verdict (only when
 * knowledge-tree + network + an API config are all on). Fire-and-forget from App.tsx; any
 * LLM-tier failure degrades silently to one ai_failures row and never blocks startup.
 * Main exports: runDedupSweep.
 */
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildSynonymJudgeMessages,
  findSuspectSynonymPairs,
  type JudgedNodePair,
  planMechanicalMerges,
  planSynonymVerdictMerges,
  SYNONYM_SIMILARITY_THRESHOLD,
  type SynonymJudgePairText,
  synonymJudgeSchema,
} from "@breadcrumb/plugin-knowledge-tree";
import { appEventBus } from "../stores/chatStore";
import { useKnowledgeStore } from "../stores/knowledgeStore";
import { type ApiConfig, useSettingsStore } from "../stores/settingsStore";
import { getRepos } from "./db";
import { recordAiFailure } from "./failureLog";
import { llmConfigFrom } from "./llmConfig";
import { recordMeteredCall } from "./metering";
import { nowIso } from "./time";

/** One batched LLM call per sweep, capped at 10 pairs (spec 015 #4). */
const MAX_LLM_DEDUP_PAIRS_PER_SWEEP = 10;

/** Runs the mechanical tier unconditionally, then the LLM tier when allowed. Refreshes
 * knowledgeStore's tree and fires mastery:updated (so the planner recomputes) once, only if
 * at least one merge actually happened. Every stage is independently best-effort — this
 * promise never rejects, matching spec 015 #4's "静默、失败记 ai_failures". */
export async function runDedupSweep(): Promise<void> {
  const mergedNodeIds = new Set<string>();

  try {
    const repos = await getRepos();
    const nodesBeforeMechanical = await repos.knowledgeNodes.listAll();
    for (const merge of planMechanicalMerges(nodesBeforeMechanical)) {
      await repos.nodeMerge.mergeNode(
        merge.canonicalId,
        merge.duplicateId,
        merge.duplicateLabel,
        nowIso(),
      );
      mergedNodeIds.add(merge.canonicalId);
    }
  } catch (error) {
    void recordAiFailure("knowledge-tree", error);
  }

  const settings = useSettingsStore.getState();
  if (settings.featureSwitches.knowledgeTree && settings.networkEnabled && settings.apiConfig) {
    try {
      const repos = await getRepos();
      const merges = await planLlmTierMerges(settings.apiConfig);
      for (const merge of merges) {
        await repos.nodeMerge.mergeNode(
          merge.canonicalId,
          merge.duplicateId,
          merge.duplicateLabel,
          nowIso(),
        );
        mergedNodeIds.add(merge.canonicalId);
      }
    } catch (error) {
      void recordAiFailure("knowledge-tree", error);
    }
  }

  if (mergedNodeIds.size > 0) {
    try {
      await useKnowledgeStore.getState().loadTree();
      appEventBus.emit("mastery:updated", { changedNodeIds: [...mergedNodeIds] });
    } catch (error) {
      void recordAiFailure("knowledge-tree", error);
    }
  }
}

async function planLlmTierMerges(apiConfig: ApiConfig) {
  const repos = await getRepos();
  const [nodes, embeddings, aliases] = await Promise.all([
    repos.knowledgeNodes.listAll(),
    repos.nodeEmbeddings.listAll(),
    repos.nodeAliases.listAll(),
  ]);
  const aliasNodeIdByLabel = new Map(aliases.map((alias) => [alias.alias_label, alias.node_id]));
  const suspectPairs = findSuspectSynonymPairs(
    nodes,
    embeddings,
    aliasNodeIdByLabel,
    SYNONYM_SIMILARITY_THRESHOLD,
  ).slice(0, MAX_LLM_DEDUP_PAIRS_PER_SWEEP);
  if (suspectPairs.length === 0) return [];

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const pairs: JudgedNodePair[] = suspectPairs.map((pair, index) => ({
    pairId: `p${index}`,
    nodeAId: pair.nodeAId,
    nodeBId: pair.nodeBId,
  }));
  const pairTexts: SynonymJudgePairText[] = suspectPairs.map((pair, index) => ({
    pairId: `p${index}`,
    newLabel: pair.nodeALabel,
    newSummary: nodesById.get(pair.nodeAId)?.summary ?? "",
    existingLabel: pair.nodeBLabel,
    existingSummary: nodesById.get(pair.nodeBId)?.summary ?? "",
  }));

  const config = llmConfigFrom(apiConfig);
  const { parsed, usage } = await chatJson(
    config,
    buildSynonymJudgeMessages(pairTexts),
    synonymJudgeSchema,
  );
  await recordMeteredCall({
    purpose: "knowledge-tree",
    model: config.model,
    conversationId: null,
    usage,
  });

  return planSynonymVerdictMerges(pairs, parsed.verdicts, nodesById);
}
