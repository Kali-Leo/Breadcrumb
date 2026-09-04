/**
 * Purpose: startup auto-merge sweep for spec 015 #4 — mechanically merges normalized-label
 * duplicate nodes (always, zero LLM), then asks the synonym-judge LLM about up to 10
 * never-yet-judged embedding-similar existing-node pairs and merges every "same" verdict
 * (only when knowledge-tree + network + an API config are all on). Every verdict, "different"
 * included, is cached in node_pair_verdicts, so a pair is paid for once ever instead of on
 * every startup. Fire-and-forget from App.tsx; any LLM-tier failure degrades silently to one
 * ai_failures row and never blocks startup.
 * Main exports: runDedupSweep.
 */
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildSynonymJudgeMessages,
  findSuspectSynonymPairs,
  type JudgedNodePair,
  planMechanicalMerges,
  planSynonymVerdictMerges,
  type SynonymJudgePairText,
  synonymJudgeSchema,
} from "@breadcrumb/feature-knowledge-tree";
import { appEventBus } from "../../stores/chatStore";
import { useKnowledgeStore } from "../../stores/knowledgeStore";
import { type ApiConfig, useSettingsStore } from "../../stores/settingsStore";
import { recordFailedCallUsage, recordMeteredCall } from "../billing/metering";
import { getRepos } from "../platform/db";
import { recordAiFailure } from "../platform/failureLog";
import { llmConfigFrom } from "../platform/llmConfig";
import { newId, nowIso } from "../platform/time";

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
        newId(),
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
      const { merges, pairs, verdicts } = await planLlmTierMerges(settings.apiConfig);
      const gone = new Set<string>();
      try {
        for (const merge of merges) {
          await repos.nodeMerge.mergeNode(
            merge.canonicalId,
            merge.duplicateId,
            merge.duplicateLabel,
            nowIso(),
            newId(),
          );
          mergedNodeIds.add(merge.canonicalId);
          gone.add(merge.duplicateId);
        }
      } finally {
        // Cached only once the merges are done, and never for a "same" — see cacheVerdicts.
        // `finally`, so the "different" answers already paid for in this batch survive a
        // merge that throws partway through.
        await cacheVerdicts(pairs, verdicts, gone);
      }
    } catch (error) {
      void recordAiFailure("knowledge-tree", error);
      void recordFailedCallUsage(error, {
        purpose: "knowledge-tree",
        model: settings.apiConfig.model,
        conversationId: null,
      });
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

/** The merges to run plus the raw judgments behind them — the caller caches the judgments
 * only after the merges land, so the two cannot get out of step. */
async function planLlmTierMerges(apiConfig: ApiConfig) {
  const repos = await getRepos();
  const [nodes, embeddings, aliases, cachedVerdicts] = await Promise.all([
    repos.knowledgeNodes.listAll(),
    repos.nodeEmbeddings.listAll(),
    repos.nodeAliases.listAll(),
    repos.nodePairVerdicts.listAll(),
  ]);
  const aliasNodeIdByLabel = new Map(aliases.map((alias) => [alias.alias_label, alias.node_id]));
  // The negative cache: rows are stored with the pair already normalized (smaller id first),
  // which is the same key findSuspectSynonymPairs builds, so "different" verdicts drop out of
  // the candidate list permanently instead of being re-bought on every startup.
  const judgedPairKeys = new Set(cachedVerdicts.map((row) => `${row.node_a_id}:${row.node_b_id}`));
  const suspectPairs = findSuspectSynonymPairs({
    nodes,
    embeddings,
    aliasNodeIdByLabel,
    judgedPairKeys,
  }).slice(0, MAX_LLM_DEDUP_PAIRS_PER_SWEEP);
  if (suspectPairs.length === 0) return { merges: [], pairs: [], verdicts: [] };

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

  return {
    merges: planSynonymVerdictMerges(pairs, parsed.verdicts, nodesById),
    pairs,
    verdicts: parsed.verdicts,
  };
}

/**
 * Persists the "different" verdicts — the answer this sweep used to forget and re-buy on
 * every startup. Two rules, both learned the hard way:
 *
 * A "same" is never cached. node_pair_verdicts is a PERMANENT filter (planLlmTierMerges drops
 * every pair already in it), so a cached "same" whose merge did not actually happen retires
 * the pair forever: never merged, never re-judged, the duplicate left in the tree with
 * nothing anywhere to say why. Caching it when the merge DID happen was always pointless
 * anyway — mergeNode deletes every verdict row mentioning the duplicate inside its own
 * transaction.
 *
 * A pair touching a node this sweep merged away is skipped: node_pair_verdicts has no foreign
 * key, so such a row would sit there pointing at an id that no longer exists.
 *
 * Best-effort throughout: a cache write must never take the sweep down.
 */
async function cacheVerdicts(
  pairs: readonly JudgedNodePair[],
  verdicts: readonly { pairId: string; verdict: "same" | "different" }[],
  mergedAwayNodeIds: ReadonlySet<string>,
): Promise<void> {
  try {
    const repos = await getRepos();
    const pairById = new Map(pairs.map((pair) => [pair.pairId, pair]));
    const judgedAt = nowIso();
    for (const verdict of verdicts) {
      if (verdict.verdict !== "different") continue;
      const pair = pairById.get(verdict.pairId);
      if (pair === undefined) continue;
      if (mergedAwayNodeIds.has(pair.nodeAId) || mergedAwayNodeIds.has(pair.nodeBId)) continue;
      await repos.nodePairVerdicts.record(pair.nodeAId, pair.nodeBId, verdict.verdict, judgedAt);
    }
  } catch (error) {
    void recordAiFailure("knowledge-tree", error);
  }
}
