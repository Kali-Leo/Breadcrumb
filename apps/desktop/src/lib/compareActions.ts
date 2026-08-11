/**
 * Purpose: comparison-tree actions (spec 023) — idempotent import of the evidence-backed
 * built-in profiles, pure assembly of one profile's overlap tree from the user's own
 * knowledge state, and row/definition conversion. Standalone module: reads user knowledge
 * data from repos directly, shares no logic with planner/ladder/goals.
 * Main exports: ensureBuiltinProfiles, computeComparisonTree, profileRowsToDefinitionItems.
 */
import type { ComparisonProfileItemRow } from "@breadcrumb/core-db";
import {
  alignmentCountsAsOverlap,
  buildOverlapTree,
  findProfileStructureError,
  type LeafMatch,
  matchProfileLeaves,
  type OverlapNode,
  type ProfileDefinition,
  type ProfileItemDefinition,
  profileDefinitionSchema,
} from "@breadcrumb/plugin-compare";
import { computeMastery, LIT_THRESHOLD } from "@breadcrumb/plugin-memory";
import { FRONTEND_MDN_PROFILE } from "../data/frontendMdnProfile";
import { GAOZHONG_MATH_PROFILE } from "../data/gaozhongMathProfile";
import { getRepos } from "./db";
import { nowIso } from "./time";

const BUILTIN_PROFILES: readonly ProfileDefinition[] = [
  FRONTEND_MDN_PROFILE,
  GAOZHONG_MATH_PROFILE,
];

/** Conservative aliases parse: anything not a plain string array degrades to no aliases. */
function parseAliases(aliasesJson: string): string[] {
  try {
    const parsed: unknown = JSON.parse(aliasesJson);
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")) {
      return parsed;
    }
  } catch {
    // fall through
  }
  return [];
}

/** Definition items → stable rows: item id = `${profileId}:${key}` so keys stay readable
 * while ids are globally unique. Position preserves authored order; kind defaults to
 * knowledge for pre-026 definitions. */
export function definitionToItemRows(definition: ProfileDefinition): ComparisonProfileItemRow[] {
  return definition.items.map((item, index) => ({
    id: `${definition.id}:${item.key}`,
    profile_id: definition.id,
    parent_id: item.parentKey === null ? null : `${definition.id}:${item.parentKey}`,
    label: item.label,
    aliases_json: JSON.stringify(item.aliases),
    source_ref: item.sourceRef,
    position: index,
    concept_id: item.conceptId,
    item_kind: item.kind ?? "knowledge",
  }));
}

/** Stored rows → matcher-shaped items, using row ids as keys (already unique). Malformed
 * aliases_json degrades to no aliases — conservative, never throws. */
export function profileRowsToDefinitionItems(
  rows: readonly ComparisonProfileItemRow[],
): ProfileItemDefinition[] {
  return rows.map((row) => ({
    key: row.id,
    parentKey: row.parent_id,
    label: row.label,
    aliases: parseAliases(row.aliases_json),
    sourceRef: row.source_ref,
    conceptId: row.concept_id,
    kind: row.item_kind,
  }));
}

/** Single-flight guard: React StrictMode double-runs effects in dev, and two concurrent
 * imports would race their delete+insert pairs. */
let ensureInFlight: Promise<void> | null = null;

/**
 * Validates and imports the built-in profiles, idempotently: a profile is (re)written only
 * when missing or when its item count changed (i.e. this build ships a revision). A
 * definition failing its own schema/structure check is skipped loudly — shipping half a
 * profile would fake objectivity.
 */
export function ensureBuiltinProfiles(): Promise<void> {
  if (ensureInFlight === null) {
    ensureInFlight = importBuiltinProfiles().finally(() => {
      ensureInFlight = null;
    });
  }
  return ensureInFlight;
}

async function importBuiltinProfiles(): Promise<void> {
  const repos = await getRepos();
  for (const definition of BUILTIN_PROFILES) {
    const parsed = profileDefinitionSchema.safeParse(definition);
    if (!parsed.success) {
      console.warn(`builtin profile ${definition.id} failed schema validation, skipped`);
      continue;
    }
    const structureError = findProfileStructureError(parsed.data);
    if (structureError !== null) {
      console.warn(`builtin profile ${definition.id} malformed (${structureError}), skipped`);
      continue;
    }
    const existing = await repos.comparisons.getProfile(definition.id);
    if (existing !== null) {
      const items = await repos.comparisons.listItems(definition.id);
      if (items.length === definition.items.length) continue;
    }
    await repos.comparisons.replaceProfile(
      {
        id: definition.id,
        title: definition.title,
        origin: "builtin",
        description: definition.description,
        source_note: definition.sourceNote,
        created_at: nowIso(),
        // Built-in profiles are all curriculum/skill-tree material (spec 026's occupation
        // category is only ever produced by the occupation-profile pipeline).
        category: "curriculum",
      },
      definitionToItemRows(definition),
    );
  }
}

/**
 * Computes one profile's overlap tree against the user's current knowledge state (nodes,
 * judged-identical aliases, mastery from real footprints + self-report claims), wrapped
 * under ONE visible root carrying the profile's title — the tree reads as a tree, not a
 * list (Leo, 2026-08-09 feedback #3). Returns null when the profile does not exist. Pure
 * local work — no AI, no network.
 */
export async function computeComparisonTree(profileId: string): Promise<OverlapNode | null> {
  const repos = await getRepos();
  const profile = await repos.comparisons.getProfile(profileId);
  if (profile === null) return null;
  const [itemRows, nodes, aliasRows, sightings, claims, anchors] = await Promise.all([
    repos.comparisons.listItems(profileId),
    repos.knowledgeNodes.listAll(),
    repos.nodeAliases.listAll(),
    repos.nodeSightings.listAll(),
    repos.masteryClaims.listAll(),
    repos.canonical.listAnchors(),
  ]);
  const items = profileRowsToDefinitionItems(itemRows);
  const matches = matchProfileLeaves(items, nodes, aliasRows);
  // Anchor join (spec 025): a leaf whose concept a user node is confidently anchored to
  // counts as matched — pure local lookup, the "一下子看清" path never generates anything.
  const labelByNodeId = new Map(nodes.map((node) => [node.id, node.label]));
  const anchorByConcept = new Map<string, { nodeId: string; reason: string }>();
  for (const anchor of anchors) {
    if (!alignmentCountsAsOverlap(anchor.verdict, anchor.confidence)) continue;
    if (!labelByNodeId.has(anchor.node_id)) continue; // node deleted since anchoring
    if (!anchorByConcept.has(anchor.concept_id)) {
      anchorByConcept.set(anchor.concept_id, { nodeId: anchor.node_id, reason: anchor.reason });
    }
  }
  for (const item of items) {
    if (item.conceptId === null) continue;
    if (matches.get(item.key) ?? null) continue;
    if (!matches.has(item.key)) continue; // only leaves live in the match map
    const anchored = anchorByConcept.get(item.conceptId);
    if (anchored === undefined) continue;
    const semanticMatch: LeafMatch = {
      itemKey: item.key,
      nodeId: anchored.nodeId,
      nodeLabel: labelByNodeId.get(anchored.nodeId) as string,
      via: "semantic",
      matchedText: anchored.reason,
    };
    matches.set(item.key, semanticMatch);
  }
  const masteryByNode = computeMastery(sightings, claims, nowIso());
  // Pure experience leaves score by the learner's own 0–10 score (spec 029), 分/10.
  const scores = await repos.practice.listScores();
  const practiceValueByKey = new Map(scores.map((row) => [row.item_id, row.score / 10]));
  const roots = buildOverlapTree(
    items,
    matches,
    (nodeId) => (masteryByNode.get(nodeId) ?? 0) >= LIT_THRESHOLD,
    practiceValueByKey,
  );
  const leafCount = roots.reduce((sum, node) => sum + node.leafCount, 0);
  const matchedLeafCount = roots.reduce((sum, node) => sum + node.matchedLeafCount, 0);
  return {
    key: `root:${profile.id}`,
    label: profile.title,
    sourceRef: profile.source_note,
    isLeaf: false,
    kind: "structure",
    leafCount,
    matchedLeafCount,
    ratio: leafCount === 0 ? 0 : matchedLeafCount / leafCount,
    match: null,
    children: roots,
  };
}
