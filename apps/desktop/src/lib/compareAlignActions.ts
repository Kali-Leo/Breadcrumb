/**
 * Purpose: the semantic-alignment run for one profile (spec 024) — local embedding recall
 * (free, offline fastembed), batched metered LLM judgment (purpose "compare-align"), and
 * crosswalk persistence. Every pair is judged at most once, ever; reruns cost tokens only
 * for pairs that appeared since. Main exports: runAlignmentForProfile.
 */
import type { ComparisonAlignmentRow } from "@breadcrumb/core-db";
import { chatJson } from "@breadcrumb/core-llm";
import {
  ALIGNMENT_JUDGE_BATCH_SIZE,
  type AlignmentCandidatePair,
  alignmentJudgeSchema,
  alignmentTextOfItem,
  buildAlignmentJudgeMessages,
  chunkPairs,
  generateAlignmentCandidates,
  matchProfileLeaves,
  validateAlignmentVerdicts,
} from "@breadcrumb/plugin-compare";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { useSettingsStore } from "../stores/settingsStore";
import { profileRowsToDefinitionItems } from "./compareActions";
import { getRepos } from "./db";
import { embedTexts } from "./embeddings";
import { recordAiFailure } from "./failureLog";
import { recordMeteredCall } from "./metering";
import { nowIso } from "./time";

/** Parses a stored embedding vector; malformed rows are skipped, never fatal. */
function parseVector(vectorJson: string): number[] | null {
  try {
    const parsed: unknown = JSON.parse(vectorJson);
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === "number")) {
      return parsed;
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Runs alignment for one profile and returns how many new pairs were judged, or null when
 * the run cannot happen right now (switch off, offline, no API config, embedding model not
 * ready). String matching keeps working regardless — alignment only ever adds.
 */
export async function runAlignmentForProfile(profileId: string): Promise<number | null> {
  const settings = useSettingsStore.getState();
  if (!settings.featureSwitches.compareAlignment) return null;
  if (!settings.networkEnabled || settings.apiConfig === null) return null;

  const repos = await getRepos();
  const [itemRows, nodes, aliasRows, nodeEmbeddingRows, existing] = await Promise.all([
    repos.comparisons.listItems(profileId),
    repos.knowledgeNodes.listAll(),
    repos.nodeAliases.listAll(),
    repos.nodeEmbeddings.listAll(),
    repos.comparisons.listAlignments(profileId),
  ]);
  if (itemRows.length === 0) return 0;
  const items = profileRowsToDefinitionItems(itemRows);

  // Prune 1: items already string-matched need no alignment. Prune 2: pairs already judged.
  const stringMatches = matchProfileLeaves(items, nodes, aliasRows);
  const matchedItemKeys = new Set(
    [...stringMatches.entries()].filter(([, match]) => match !== null).map(([itemKey]) => itemKey),
  );
  const judgedPairs = new Set(existing.map((row) => `${row.item_id}:${row.node_id}`));

  const nodeVectors = new Map<string, readonly number[]>();
  for (const row of nodeEmbeddingRows) {
    const vector = parseVector(row.vector_json);
    if (vector !== null) nodeVectors.set(row.node_id, vector);
  }

  const unmatchedLeafItems = items.filter((item) => !matchedItemKeys.has(item.key));
  const vectors = await embedTexts(unmatchedLeafItems.map(alignmentTextOfItem));
  if (vectors === null) return null; // local model not ready — silent, string matching stands
  const itemVectors = new Map<string, readonly number[]>();
  unmatchedLeafItems.forEach((item, index) => {
    const vector = vectors[index];
    if (vector !== undefined) itemVectors.set(item.key, vector);
  });

  const candidates = generateAlignmentCandidates({
    items,
    itemVectors,
    nodes,
    nodeVectors,
    judgedPairs,
    matchedItemKeys,
  });
  if (candidates.length === 0) return 0;

  const config = { ...settings.apiConfig, fetchImpl: tauriFetch };
  let judgedCount = 0;
  for (const batch of chunkPairs<AlignmentCandidatePair>(candidates, ALIGNMENT_JUDGE_BATCH_SIZE)) {
    try {
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
      const verdicts = validateAlignmentVerdicts(batch.length, parsed);
      if (verdicts === null) {
        void recordAiFailure("compare-align", new Error("verdict batch failed validation"));
        continue; // this batch is discarded whole; its pairs stay unjudged for a later run
      }
      const judgedAt = nowIso();
      const rows: ComparisonAlignmentRow[] = batch.map((pair, index) => {
        const verdict = verdicts[index] as NonNullable<(typeof verdicts)[number]>;
        return {
          item_id: pair.itemKey,
          node_id: pair.nodeId,
          profile_id: profileId,
          verdict: verdict.verdict,
          confidence: verdict.confidence,
          reason: verdict.reason,
          judged_at: judgedAt,
        };
      });
      await repos.comparisons.upsertAlignments(rows);
      judgedCount += rows.length;
    } catch (error) {
      void recordAiFailure("compare-align", error);
      break; // network/API trouble — stop quietly, string matching still stands
    }
  }
  return judgedCount;
}
