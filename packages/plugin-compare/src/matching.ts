/**
 * Purpose: conservative matching between a profile's leaf items and the user's knowledge
 * nodes (spec 023) — normalized string equality on labels and source-defensible aliases
 * only, deliberately NO fuzzy/semantic matching: a missed match keeps the ratio honest-low,
 * a wrong match would fake objectivity.
 * Main exports: normalizeLabel, matchProfileLeaves, LeafMatch, leafKeysOf.
 */
import type { ProfileItemDefinition } from "./profileSchema";

/** NFKC-fold, lowercase, strip ALL whitespace — symmetric on both sides, so "Async/await"
 * equals "async / await" but "作用域" never equals "作用域链". */
export function normalizeLabel(raw: string): string {
  return raw.normalize("NFKC").toLowerCase().replace(/\s+/gu, "");
}

export interface LeafMatch {
  itemKey: string;
  nodeId: string;
  nodeLabel: string;
  /** Which side of the profile item matched: its own label or one of its aliases. */
  via: "label" | "alias";
  /** The exact profile-side text that matched, for the "对上了哪条" explanation. */
  matchedText: string;
}

/** The keys of items nobody points at as parent — the tree's leaves, the only match targets. */
export function leafKeysOf(items: readonly ProfileItemDefinition[]): Set<string> {
  const parents = new Set<string>();
  for (const item of items) {
    if (item.parentKey !== null) parents.add(item.parentKey);
  }
  return new Set(items.filter((item) => !parents.has(item.key)).map((item) => item.key));
}

/**
 * Matches every leaf item against the user's nodes (labels plus judged-identical alias
 * labels from the synonym gate). First hit wins: the item's own label first, then aliases
 * in authored order. Returns a complete map — unmatched leaves map to null.
 */
export function matchProfileLeaves(
  items: readonly ProfileItemDefinition[],
  userNodes: readonly { id: string; label: string }[],
  userAliasRows: readonly { alias_label: string; node_id: string }[],
): Map<string, LeafMatch | null> {
  const nodeByNormalized = new Map<string, { id: string; label: string }>();
  for (const node of userNodes) {
    const normalized = normalizeLabel(node.label);
    if (!nodeByNormalized.has(normalized)) nodeByNormalized.set(normalized, node);
  }
  const labelByNodeId = new Map(userNodes.map((node) => [node.id, node.label]));
  for (const aliasRow of userAliasRows) {
    const normalized = normalizeLabel(aliasRow.alias_label);
    const nodeLabel = labelByNodeId.get(aliasRow.node_id);
    if (nodeLabel !== undefined && !nodeByNormalized.has(normalized)) {
      nodeByNormalized.set(normalized, { id: aliasRow.node_id, label: nodeLabel });
    }
  }

  const result = new Map<string, LeafMatch | null>();
  const leafKeys = leafKeysOf(items);
  for (const item of items) {
    if (!leafKeys.has(item.key)) continue;
    const candidates: { text: string; via: "label" | "alias" }[] = [
      { text: item.label, via: "label" },
      ...item.aliases.map((alias) => ({ text: alias, via: "alias" as const })),
    ];
    let match: LeafMatch | null = null;
    for (const candidate of candidates) {
      const node = nodeByNormalized.get(normalizeLabel(candidate.text));
      if (node !== undefined) {
        match = {
          itemKey: item.key,
          nodeId: node.id,
          nodeLabel: node.label,
          via: candidate.via,
          matchedText: candidate.text,
        };
        break;
      }
    }
    result.set(item.key, match);
  }
  return result;
}
