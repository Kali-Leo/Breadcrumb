/**
 * Purpose: pure canonical-subtree mounting (spec 028) — copies an evidence-backed subtree
 * (e.g. MDN's JavaScript modules) under a hub item so the hub's ratio aggregates from real
 * knowledge points. Keys are prefixed for uniqueness; every sourceRef is kept verbatim.
 * Main exports: MountableSubtree, mountSubtreeUnder.
 */
import type { ProfileItemDefinition } from "./profileSchema";

export interface MountableSubtree {
  /** Stable id so one subtree mounts at most once per profile build (no double counting). */
  id: string;
  /** Plain statement of what is being mounted, shown on the hub node (e.g.
   * "MDN Curriculum 的 JavaScript 模块"). */
  note: string;
  /** The subtree's items; roots carry parentKey === null and get re-parented to the hub. */
  items: readonly ProfileItemDefinition[];
}

const MAX_KEY_LENGTH = 60;

/**
 * Returns the subtree's items re-keyed under the hub. Items whose prefixed key would break
 * the schema's key length are dropped WITH their descendants (structural safety over
 * partial mounts) — callers keep subtree keys short so this never fires in practice.
 */
export function mountSubtreeUnder(
  hubKey: string,
  subtree: MountableSubtree,
): ProfileItemDefinition[] {
  const prefix = `m-${subtree.id}-`;
  const dropped = new Set<string>();
  const mounted: ProfileItemDefinition[] = [];
  for (const item of subtree.items) {
    const key = `${prefix}${item.key}`;
    if (key.length > MAX_KEY_LENGTH || (item.parentKey !== null && dropped.has(item.parentKey))) {
      dropped.add(item.key);
      continue;
    }
    mounted.push({
      ...item,
      key,
      parentKey: item.parentKey === null ? hubKey : `${prefix}${item.parentKey}`,
    });
  }
  return mounted;
}
