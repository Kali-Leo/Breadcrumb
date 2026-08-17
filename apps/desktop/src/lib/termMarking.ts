/**
 * Purpose: the metered LLM term-marking call (spec 043) — one flash-level call per (message |
 * focus_node) answer, picking words that would trip up this learner; caches its verdict so the
 * same target is never billed twice. Fails soft: any error logs to ai_failures and returns no
 * terms, leaving the reply's doors in their unmarked (legacy-source-only) state.
 * Side effects: LLM call, metering row (purpose "term-marking"), one term_marks insert.
 * Main exports: ensureTermMarks.
 */
import type { MasteryClaimRow, NodeSightingRow, TermMarkTargetKind } from "@breadcrumb/core-db";
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildTermMarkingMessages,
  clipTermsByDensity,
  LEARNER_EVIDENCE_THRESHOLD,
  termMarkResponseSchema,
} from "@breadcrumb/plugin-explore";
import { computeMastery, LIT_THRESHOLD } from "@breadcrumb/plugin-memory";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { useSettingsStore } from "../stores/settingsStore";
import { getRepos } from "./db";
import { recordAiFailure } from "./failureLog";
import { recordMeteredCall } from "./metering";
import { newId, nowIso } from "./time";

/** Both evidence lists handed to the model are capped here (spec 043 §2). */
const LABEL_LIST_CAP = 50;

/** Concurrent calls for the same target share one promise — without this, two renders racing
 * past the cache check would each bill an LLM call and the loser's insert would hit the
 * UNIQUE index (the recurring term-marking rows in ai_failures, 2026-08-15/16). */
const inflight = new Map<string, Promise<string[]>>();

/** Returns the marked term strings for one target — computing and caching them on a first
 * call, reading the cache on every later one (spec 043 §5): the same target is never billed
 * twice. Returns [] (no LLM call at all) while the switch is off, networking is off, there's
 * no API config, or the answer is blank; returns [] and logs a failure on any error along the
 * way — a target that fails is simply retried next time it's asked for (no cache row written). */
export async function ensureTermMarks(
  targetKind: TermMarkTargetKind,
  targetId: string,
  answerText: string,
  conversationId: string,
): Promise<string[]> {
  const inflightKey = `${targetKind}:${targetId}`;
  const pending = inflight.get(inflightKey);
  if (pending !== undefined) return pending;
  const task = computeTermMarks(targetKind, targetId, answerText, conversationId);
  inflight.set(inflightKey, task);
  try {
    return await task;
  } finally {
    inflight.delete(inflightKey);
  }
}

async function computeTermMarks(
  targetKind: TermMarkTargetKind,
  targetId: string,
  answerText: string,
  conversationId: string,
): Promise<string[]> {
  const repos = await getRepos();
  const cached = await repos.termMarks.getByTarget(targetKind, targetId);
  if (cached !== null) return JSON.parse(cached.terms_json) as string[];

  const { featureSwitches, networkEnabled, apiConfig } = useSettingsStore.getState();
  if (!featureSwitches.termMarking || !networkEnabled || apiConfig === null) return [];
  if (answerText.trim().length === 0) return [];

  try {
    const [nodes, sightings, claims, lookedUpLabelsAll] = await Promise.all([
      repos.knowledgeNodes.listAll(),
      repos.nodeSightings.listAll(),
      repos.masteryClaims.listAll(),
      repos.focusNodes.listDistinctWordLabels(),
    ]);
    const masteryByNode = computeMastery(sightings, claims, nowIso());
    const litLabels = nodes
      .filter((node) => (masteryByNode.get(node.id) ?? 0) >= LIT_THRESHOLD)
      .sort((a, b) => (masteryByNode.get(b.id) ?? 0) - (masteryByNode.get(a.id) ?? 0))
      .slice(0, LABEL_LIST_CAP)
      .map((node) => node.label);
    const lookedUpLabels = lookedUpLabelsAll.slice(0, LABEL_LIST_CAP);
    const evidenceCount = computeEvidenceCount(sightings, claims, lookedUpLabelsAll);

    const config = { ...apiConfig, fetchImpl: tauriFetch };
    const { parsed, usage } = await chatJson(
      config,
      buildTermMarkingMessages(answerText, litLabels, lookedUpLabels),
      termMarkResponseSchema,
    );
    await recordMeteredCall({
      purpose: "term-marking",
      model: config.model,
      conversationId,
      usage,
    });

    const clipped = clipTermsByDensity(
      parsed.terms.map((term) => term.term),
      answerText.length,
      evidenceCount,
      LEARNER_EVIDENCE_THRESHOLD,
    );
    await repos.termMarks.insert({
      id: newId(),
      target_kind: targetKind,
      target_id: targetId,
      terms_json: JSON.stringify(clipped),
      created_at: nowIso(),
    });
    return clipped;
  } catch (error) {
    void recordAiFailure("term-marking", error);
    return [];
  }
}

/** "了解度" (spec 043 §4): the union of distinct nodes with any footprint or self-report claim
 * plus distinct looked-up words — a matched focus-session guess is already folded into
 * node_sightings (gradeFocusGuess records one there), so it needs no separate case here. */
function computeEvidenceCount(
  sightings: readonly NodeSightingRow[],
  claims: readonly MasteryClaimRow[],
  lookedUpLabels: readonly string[],
): number {
  const keys = new Set<string>();
  for (const sighting of sightings) keys.add(`node:${sighting.node_id}`);
  for (const claim of claims) keys.add(`node:${claim.node_id}`);
  for (const label of lookedUpLabels) keys.add(`word:${label}`);
  return keys.size;
}
