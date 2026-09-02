/**
 * Purpose: the anchor layer's paid tail (spec 025) — LLM-judges unanchored knowledge nodes
 * against embedding-recalled canonical concepts, batched, every pair judged once ever, under
 * a hard per-sweep budget. The free alias path and the inventory import live in
 * canonicalConcepts.ts; the concept-vector cache in canonicalConceptVectors.ts.
 * Main exports: runAnchorSweep, ANCHOR_SWEEP_BATCH_BUDGET.
 */
import type { NodeConceptAnchorRow } from "@breadcrumb/core-db";
import { chatJson } from "@breadcrumb/core-llm";
import {
  ALIGNMENT_JUDGE_BATCH_SIZE,
  type AlignmentCandidatePair,
  alignmentJudgeSchema,
  buildAlignmentJudgeMessages,
  chunkPairs,
  dormantNodeIds,
  validateAlignmentVerdicts,
} from "@breadcrumb/feature-compare";
import { useSettingsStore } from "../../stores/settingsStore";
import { recordMeteredCall } from "../billing/metering";
import { getRepos } from "../platform/db";
import { recordAiFailure } from "../platform/failureLog";
import { llmConfigFrom } from "../platform/llmConfig";
import { nowIso } from "../platform/time";
import { buildAnchorCandidates, parseNodeVectors } from "./anchorCandidates";
import { anchorNodesByAlias, ensureCanonicalConcepts } from "./canonicalConcepts";
import { loadConceptVectors } from "./canonicalConceptVectors";

/**
 * Hard ceiling on judge calls per sweep. The sweep used to walk the entire candidate list
 * with no round limit, and since judged pairs never re-enter, every visit to the comparison
 * page dug three more concepts deeper — a state that never converges (design audit
 * 2026-08-28 #2: 230 distinct batch timestamps, ~$7.2 to exhaust the list, all of it waste).
 * Two batches is deliberately small: with the relative gate replacing the old 0.72 floor the
 * candidate list is two orders of magnitude shorter, so a real backlog now drains over a few
 * visits instead of never.
 */
export const ANCHOR_SWEEP_BATCH_BUDGET = 2;

/**
 * The paid tail: judges unanchored nodes against embedding-recalled concepts (switch-gated,
 * batched, every pair once ever, at most ANCHOR_SWEEP_BATCH_BUDGET calls). Returns newly
 * judged pair count, or null when it cannot run right now. Nodes that already carry a
 * confident anchor are skipped — one anchor is enough for the join, and skipping them keeps
 * the token bill at the true tail.
 */
export async function runAnchorSweep(): Promise<number | null> {
  const settings = useSettingsStore.getState();
  if (!settings.featureSwitches.compareAlignment) return null;
  if (!settings.networkEnabled || settings.apiConfig === null) return null;

  await ensureCanonicalConcepts();
  const repos = await getRepos();
  const [concepts, anchors, nodes, nodeEmbeddingRows] = await Promise.all([
    repos.canonical.listConcepts(),
    repos.canonical.listAnchors(),
    repos.knowledgeNodes.listAll(),
    repos.nodeEmbeddings.listAll(),
  ]);
  const anchoredNodeIds = new Set(
    anchors.filter((row) => row.verdict === "same").map((row) => row.node_id),
  );
  const unanchored = nodes.filter((node) => !anchoredNodeIds.has(node.id));
  // Nothing unanchored: the sweep has no work at all, so it must not embed, judge, or even
  // reload — the comparison page opening is not by itself a reason to spend anything.
  if (unanchored.length === 0) return 0;

  // Free pass first (pre-existing nodes never went through birth anchoring): alias-equal
  // pairs must not cost a judge call. Then reload so the paid tail sees the fresh anchors.
  await anchorNodesByAlias(unanchored);
  const refreshedAnchors = await repos.canonical.listAnchors();
  const judgedPairs = new Set(refreshedAnchors.map((row) => `${row.concept_id}:${row.node_id}`));
  const confidentNodeIds = new Set(
    refreshedAnchors.filter((row) => row.verdict === "same").map((row) => row.node_id),
  );
  // A node the judge has already called unlike six different concepts is the learner's own
  // idea, not a curriculum item under another name; asking again with a fresh top-k would
  // buy the same answer twice (see feature-compare/anchorDormancy.ts). The free alias pass
  // above still covers it, so a newly added concept with the same name is still found.
  const dormant = dormantNodeIds(refreshedAnchors);
  const openNodes = nodes.filter((node) => !confidentNodeIds.has(node.id) && !dormant.has(node.id));
  if (openNodes.length === 0) return 0;

  const conceptVectorById = await loadConceptVectors(concepts);
  if (conceptVectorById === null) return null; // local model not ready

  const candidates = buildAnchorCandidates({
    openNodes,
    nodeVectors: parseNodeVectors(nodeEmbeddingRows),
    concepts,
    conceptVectorById,
    judgedPairs,
  });
  if (candidates.length === 0) return 0;

  return judgeCandidates(candidates, llmConfigFrom(settings.apiConfig), repos);
}

async function judgeCandidates(
  candidates: readonly AlignmentCandidatePair[],
  config: ReturnType<typeof llmConfigFrom>,
  repos: Awaited<ReturnType<typeof getRepos>>,
): Promise<number> {
  let judgedCount = 0;
  const batches = chunkPairs<AlignmentCandidatePair>(candidates, ALIGNMENT_JUDGE_BATCH_SIZE).slice(
    0,
    ANCHOR_SWEEP_BATCH_BUDGET,
  );
  for (const batch of batches) {
    try {
      // One retry on a malformed verdict batch: a transient bad completion (ai_failures
      // 2026-08-10) is far cheaper to re-ask than to postpone the pairs a whole sweep.
      let verdicts: ReturnType<typeof validateAlignmentVerdicts> = null;
      for (let attempt = 0; attempt < 2 && verdicts === null; attempt += 1) {
        const { parsed, usage } = await chatJson(
          config,
          buildAlignmentJudgeMessages(batch),
          alignmentJudgeSchema,
        );
        await recordMeteredCall({
          purpose: "compare-align",
          model: config.model,
          conversationId: null,
          usage,
        });
        verdicts = validateAlignmentVerdicts(batch.length, parsed);
      }
      if (verdicts === null) {
        void recordAiFailure(
          "compare-align",
          new Error("verdict batch failed validation twice, batch skipped"),
        );
        continue;
      }
      const anchoredAt = nowIso();
      const rows: NodeConceptAnchorRow[] = batch.map((pair, index) => {
        const verdict = verdicts[index] as NonNullable<(typeof verdicts)[number]>;
        return {
          node_id: pair.nodeId,
          concept_id: pair.itemKey,
          verdict: verdict.verdict,
          confidence: verdict.confidence,
          method: "judge",
          reason: verdict.reason,
          anchored_at: anchoredAt,
        };
      });
      await repos.canonical.upsertAnchors(rows);
      judgedCount += rows.length;
    } catch (error) {
      void recordAiFailure("compare-align", error);
      break;
    }
  }
  return judgedCount;
}
