/**
 * Purpose: the comparison profile definition contract (spec 023) — Zod boundary schema for
 * bundled/searched profile data plus structural validation (unique keys, existing parents,
 * no cycles, at least one root). Every item carries a non-empty sourceRef: evidence-backed
 * only, AI-invented content is forbidden.
 * Main exports: profileDefinitionSchema, ProfileDefinition, ProfileItemDefinition,
 * findProfileStructureError.
 */
import { z } from "zod";

export const profileItemDefinitionSchema = z.object({
  /** Stable key inside this profile, e.g. "core-js"; item ids derive from it. */
  key: z.string().min(1).max(60),
  /** null = a root category shown in the tree's initial view. */
  parentKey: z.string().min(1).max(60).nullable(),
  label: z.string().min(1).max(60),
  /** Alternative labels for conservative equality matching — every alias must itself be
   * defensible from the cited source (e.g. the unit's own 内容包括 list). */
  aliases: z.array(z.string().min(1).max(60)).max(12),
  /** Where this exact item comes from in the cited material — never empty. */
  sourceRef: z.string().min(1).max(300),
  /** The canonical concept this leaf embodies (spec 025) — the join key the anchor layer
   * matches user nodes against. null for structural/coarse items. */
  conceptId: z.string().min(1).max(80).nullable(),
});

export const profileDefinitionSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(40),
  description: z.string().min(1).max(200),
  /** The profile-level statement of what material backs it, with retrieval date. */
  sourceNote: z.string().min(1).max(400),
  items: z.array(profileItemDefinitionSchema).min(1).max(1500),
});

export type ProfileItemDefinition = z.infer<typeof profileItemDefinitionSchema>;
export type ProfileDefinition = z.infer<typeof profileDefinitionSchema>;

/**
 * Structural check beyond field shapes. Returns a human-readable problem description, or
 * null when the definition is a well-formed forest: keys unique, every parentKey points at
 * an existing item, no cycles, at least one root.
 */
export function findProfileStructureError(definition: ProfileDefinition): string | null {
  const keys = new Set<string>();
  for (const item of definition.items) {
    if (keys.has(item.key)) return `duplicate item key "${item.key}"`;
    keys.add(item.key);
  }
  let rootCount = 0;
  for (const item of definition.items) {
    if (item.parentKey === null) {
      rootCount += 1;
    } else if (!keys.has(item.parentKey)) {
      return `item "${item.key}" points at missing parent "${item.parentKey}"`;
    }
  }
  if (rootCount === 0) return "profile has no root items";

  const parentByKey = new Map(definition.items.map((item) => [item.key, item.parentKey]));
  for (const item of definition.items) {
    const seen = new Set<string>([item.key]);
    let cursor = item.parentKey;
    while (cursor !== null) {
      if (seen.has(cursor)) return `cycle through item "${cursor}"`;
      seen.add(cursor);
      cursor = parentByKey.get(cursor) ?? null;
    }
  }
  return null;
}
