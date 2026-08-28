/**
 * Purpose: the canonical concept inventory's local side (spec 025) — the once-per-run import
 * of the dev-built inventory, the text each concept is embedded/matched as, and the free
 * alias-anchoring path for newborn nodes ("the toll collected at the vocabulary entrance",
 * zero tokens, zero latency). Split out of compareAlignActions.ts to keep both files under
 * the 200-line ceiling.
 * Main exports: ensureCanonicalConcepts, anchorNodesByAlias, parseAliases, conceptText.
 */
import type {
  CanonicalConceptRow,
  KnowledgeNodeRow,
  NodeConceptAnchorRow,
} from "@breadcrumb/core-db";
import { normalizeLabel } from "@breadcrumb/plugin-compare";
import { CANONICAL_CONCEPTS } from "../data/generated/canonicalConcepts";
import { getRepos } from "./db";
import { nowIso } from "./time";

/** Set once the import has SUCCEEDED, and never cleared — the inventory is a build-time
 * constant, so re-importing it in the same run can only ever rewrite identical rows. The old
 * in-flight-only memo cleared itself in `finally`, which meant every caller after the first
 * one paid for the whole ~800-row upsert again (design audit 2026-08-28, B8). A FAILED import
 * still resets, so a transient DB error does not permanently disable anchoring. */
let importOnce: Promise<void> | null = null;

/** Imports the dev-built canonical inventory once per run (INSERT OR REPLACE — idempotent). */
export function ensureCanonicalConcepts(): Promise<void> {
  if (importOnce === null) {
    importOnce = importConcepts().catch((error: unknown) => {
      importOnce = null; // failed: let the next caller retry
      throw error;
    });
  }
  return importOnce;
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

export function parseAliases(aliasesJson: string): string[] {
  try {
    const parsed: unknown = JSON.parse(aliasesJson);
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")) return parsed;
  } catch {
    // fall through
  }
  return [];
}

/** The text a canonical concept is embedded as — label plus its known alternate names, the
 * same shape plugin-compare uses for profile items. */
export function conceptText(concept: CanonicalConceptRow): string {
  const aliases = parseAliases(concept.aliases_json);
  return aliases.length === 0 ? concept.label : `${concept.label}（${aliases.join("、")}）`;
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
        confidence: "high",
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
