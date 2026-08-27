/**
 * Purpose: the anchor layer's desktop actions (spec 025) — import the canonical concept
 * inventory (idempotent), free alias-anchoring for newborn nodes (pure in-memory lookup, the
 * "toll collected at the vocabulary entrance"), and the background sweep that LLM-judges the
 * tail (local embedding recall, batched verdicts, purpose "compare-align", every pair judged
 * once ever). Main exports: ensureCanonicalConcepts, anchorNodesByAlias, runAnchorSweep.
 */
import type {
  CanonicalConceptRow,
  KnowledgeNodeRow,
  NodeConceptAnchorRow,
} from "@breadcrumb/core-db";
import { chatJson } from "@breadcrumb/core-llm";
import {
  ALIGNMENT_JUDGE_BATCH_SIZE,
  type AlignmentCandidatePair,
  alignmentJudgeSchema,
  buildAlignmentJudgeMessages,
  chunkPairs,
  generateAlignmentCandidates,
  normalizeLabel,
  type ProfileItemDefinition,
  validateAlignmentVerdicts,
} from "@breadcrumb/plugin-compare";
import { CANONICAL_CONCEPTS } from "../data/generated/canonicalConcepts";
import { useSettingsStore } from "../stores/settingsStore";
import { getRepos } from "./db";
import { embedTexts } from "./embeddings";
import { recordAiFailure } from "./failureLog";
import { llmConfigFrom } from "./llmConfig";
import { recordMeteredCall } from "./metering";
import { nowIso } from "./time";

let ensureInFlight: Promise<void> | null = null;

/** Imports the dev-built canonical inventory once per run (INSERT OR REPLACE — idempotent). */
export function ensureCanonicalConcepts(): Promise<void> {
  if (ensureInFlight === null) {
    ensureInFlight = importConcepts().finally(() => {
      ensureInFlight = null;
    });
  }
  return ensureInFlight;
}

async function importConcepts(): Promise<void> {
  const repos = await getRepos();
  const createdAt = nowIso();
  const rows: CanonicalConceptRow[] = CANONICAL_CONCEPTS.map((concept) => ({
    id: concept.id,
    label: concept.label,
    aliases_json: JSON.stringify(concept.aliases),
    source_ref: concept.sourceRef,
    created_at: createdAt,
  }));
  await repos.canonical.upsertConcepts(rows);
}

function parseAliases(aliasesJson: string): string[] {
  try {
    const parsed: unknown = JSON.parse(aliasesJson);
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")) return parsed;
  } catch {
    // fall through
  }
  return [];
}

/** Alias texts too short to be unambiguous stay out of the free-anchor dictionary. */
function dictionaryWorthy(text: string): boolean {
  return /\p{Script=Han}/u.test(text) ? text.length >= 2 : text.length >= 4;
}

/**
 * The free path: anchors newborn nodes whose label equals (normalized) a canonical concept's
 * label or alias — zero tokens, zero latency, done at the node's birth. Misses are simply
 * left for the background sweep. Never throws.
 */
export async function anchorNodesByAlias(nodes: readonly KnowledgeNodeRow[]): Promise<void> {
  if (nodes.length === 0) return;
  try {
    await ensureCanonicalConcepts();
    const repos = await getRepos();
    const concepts = await repos.canonical.listConcepts();
    const conceptByText = new Map<string, CanonicalConceptRow>();
    for (const concept of concepts) {
      for (const text of [concept.label, ...parseAliases(concept.aliases_json)]) {
        if (dictionaryWorthy(text)) conceptByText.set(normalizeLabel(text), concept);
      }
    }
    const anchoredAt = nowIso();
    const rows: NodeConceptAnchorRow[] = [];
    for (const node of nodes) {
      const concept = conceptByText.get(normalizeLabel(node.label));
      if (concept === undefined) continue;
      rows.push({
        node_id: node.id,
        concept_id: concept.id,
        verdict: "same",
        confidence: "高",
        method: "alias",
        reason: `用词与「${concept.label}」的名称或别名一致`,
        anchored_at: anchoredAt,
      });
    }
    if (rows.length > 0) await repos.canonical.upsertAnchors(rows);
  } catch (error) {
    console.warn("alias anchoring skipped:", error);
  }
}

/**
 * The paid tail: judges unanchored nodes against embedding-recalled concepts (switch-gated,
 * batched, every pair once ever). Returns newly judged pair count, or null when it cannot
 * run right now. Nodes that already carry a confident anchor are skipped — one anchor is
 * enough for the join, and skipping them keeps the token bill at the true tail.
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
  // Free pass first (pre-existing nodes never went through birth anchoring): alias-equal
  // pairs must not cost a judge call. Then reload so the paid tail sees the fresh anchors.
  await anchorNodesByAlias(nodes.filter((node) => !anchoredNodeIds.has(node.id)));
  const refreshedAnchors = await repos.canonical.listAnchors();
  const judgedPairs = new Set(refreshedAnchors.map((row) => `${row.concept_id}:${row.node_id}`));
  const confidentNodeIds = new Set(
    refreshedAnchors.filter((row) => row.verdict === "same").map((row) => row.node_id),
  );
  const openNodes = nodes.filter((node) => !confidentNodeIds.has(node.id));
  if (openNodes.length === 0) return 0;

  // Cost direction (spec 025): candidates are generated PER NODE (top-k concepts each), not
  // per concept — the bill scales with the user's few dozen nodes, never with the 800-concept
  // inventory. Roles are swapped through the generator, then unswapped for the judge whose
  // prompt expects A = material side, B = learner side.
  const nodeItems: ProfileItemDefinition[] = openNodes.map((node) => ({
    key: node.id,
    parentKey: null,
    label: node.label,
    aliases: [],
    sourceRef: node.summary,
    conceptId: null,
  }));
  const nodeVectors = new Map<string, readonly number[]>();
  for (const row of nodeEmbeddingRows) {
    try {
      const parsed: unknown = JSON.parse(row.vector_json);
      if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === "number")) {
        nodeVectors.set(row.node_id, parsed);
      }
    } catch {
      // skip malformed
    }
  }
  const conceptVectors = await embedTexts(
    concepts.map((concept) => {
      const aliases = parseAliases(concept.aliases_json);
      return aliases.length === 0 ? concept.label : `${concept.label}（${aliases.join("、")}）`;
    }),
  );
  if (conceptVectors === null) return null; // local model not ready
  const conceptSide = concepts.map((concept, index) => ({
    id: concept.id,
    label: concept.label,
    summary: "",
    vector: conceptVectors[index],
  }));
  const conceptVectorById = new Map<string, readonly number[]>();
  for (const entry of conceptSide) {
    if (entry.vector !== undefined) conceptVectorById.set(entry.id, entry.vector);
  }
  const conceptById = new Map(concepts.map((concept) => [concept.id, concept]));

  const swappedJudged = new Set(
    [...judgedPairs].map((pair) => {
      const [conceptId, nodeId] = pair.split(":") as [string, string];
      return `${nodeId}:${conceptId}`;
    }),
  );
  const swapped = generateAlignmentCandidates({
    items: nodeItems,
    itemVectors: nodeVectors,
    nodes: conceptSide,
    nodeVectors: conceptVectorById,
    judgedPairs: swappedJudged,
    matchedItemKeys: new Set<string>(),
  });
  const candidates: AlignmentCandidatePair[] = swapped.map((pair) => {
    const concept = conceptById.get(pair.nodeId);
    const node = openNodes.find((candidate) => candidate.id === pair.itemKey);
    return {
      itemKey: pair.nodeId, // concept id — the judge's A side
      itemLabel: concept === undefined ? pair.nodeLabel : concept.label,
      itemContext: concept?.source_ref ?? "",
      nodeId: pair.itemKey, // node id — the judge's B side
      nodeLabel: pair.itemLabel,
      nodeSummary: node?.summary ?? "",
      similarity: pair.similarity,
    };
  });
  if (candidates.length === 0) return 0;

  const config = llmConfigFrom(settings.apiConfig);
  let judgedCount = 0;
  for (const batch of chunkPairs<AlignmentCandidatePair>(candidates, ALIGNMENT_JUDGE_BATCH_SIZE)) {
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
