/**
 * Purpose: comparison-tree actions (spec 023) — idempotent import of the evidence-backed
 * built-in profiles, pure assembly of one profile's overlap tree from the user's own
 * knowledge state, and row/definition conversion. Standalone module: reads user knowledge
 * data from repos directly, shares no logic with planner/ladder/goals.
 * Main exports: ensureBuiltinProfiles, computeComparisonTree, profileRowsToDefinitionItems.
 */
import type { ComparisonProfileItemRow } from "@breadcrumb/core-db";
import {
  buildOverlapTree,
  findProfileStructureError,
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
 * while ids are globally unique. Position preserves authored order. */
function definitionToItemRows(definition: ProfileDefinition): ComparisonProfileItemRow[] {
  return definition.items.map((item, index) => ({
    id: `${definition.id}:${item.key}`,
    profile_id: definition.id,
    parent_id: item.parentKey === null ? null : `${definition.id}:${item.parentKey}`,
    label: item.label,
    aliases_json: JSON.stringify(item.aliases),
    source_ref: item.sourceRef,
    position: index,
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
      },
      definitionToItemRows(definition),
    );
  }
}

/**
 * Computes one profile's overlap tree against the user's current knowledge state (nodes,
 * judged-identical aliases, mastery from real footprints + self-report claims). Returns
 * null when the profile does not exist. Pure local work — no AI, no network.
 */
export async function computeComparisonTree(profileId: string): Promise<OverlapNode[] | null> {
  const repos = await getRepos();
  const profile = await repos.comparisons.getProfile(profileId);
  if (profile === null) return null;
  const [itemRows, nodes, aliasRows, sightings, claims] = await Promise.all([
    repos.comparisons.listItems(profileId),
    repos.knowledgeNodes.listAll(),
    repos.nodeAliases.listAll(),
    repos.nodeSightings.listAll(),
    repos.masteryClaims.listAll(),
  ]);
  const items = profileRowsToDefinitionItems(itemRows);
  const matches = matchProfileLeaves(items, nodes, aliasRows);
  const masteryByNode = computeMastery(sightings, claims, nowIso());
  return buildOverlapTree(
    items,
    matches,
    (nodeId) => (masteryByNode.get(nodeId) ?? 0) >= LIT_THRESHOLD,
  );
}
