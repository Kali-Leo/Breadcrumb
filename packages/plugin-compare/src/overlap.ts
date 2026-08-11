/**
 * Purpose: pure overlap aggregation for the comparison tree (spec 023) — folds leaf match
 * results into a display tree where every node carries its overlap ratio (matched-and-lit
 * leaves ÷ profile leaves under it), the number the UI prints on the node and shades the
 * amber gradient by. Plain math, no AI anywhere.
 * Main exports: buildOverlapTree, OverlapNode.
 */
import type { LeafMatch } from "./matching";
import { leafKeysOf } from "./matching";
import type { ProfileItemDefinition } from "./profileSchema";

export interface OverlapNode {
  key: string;
  label: string;
  sourceRef: string;
  isLeaf: boolean;
  /** Leaf typing (spec 026/028): practice AND tool leaves score by the learner's own
   * attestation; hub leaves are undecomposed big entities that never enter the score. */
  kind: "knowledge" | "practice" | "tool" | "hub" | "structure";
  /** Scored profile leaves under (or at) this node. 0 for an undecomposed hub (spec 028). */
  leafCount: number;
  /** Overlap mass under this node — knowledge/tool leaves contribute 0 or 1, practice
   * leaves contribute their attestation value (0 / 0.5 / 1), so this can be fractional. */
  matchedLeafCount: number;
  /** matchedLeafCount / leafCount — the number shown on the node. */
  ratio: number;
  /** For matched leaves: which user node it matched and via what text; null otherwise. */
  match: LeafMatch | null;
  children: OverlapNode[];
}

/**
 * Builds the root list of the overlap tree in authored item order. Two pure leaf kinds
 * score (spec 029): a knowledge leaf counts when it matched a user node AND that node is
 * currently lit (the isLit predicate keeps mastery semantics injected, not imported); a
 * practice (pure experience) leaf scores the learner's own 0–10 score normalized to 0–1
 * (practiceValueByKey — the user is the only expert on their own experience). Entity
 * leaves (hub, plus legacy "tool" rows) contribute nothing to any ratio — their map match
 * survives only as a 线索 for the UI.
 */
export function buildOverlapTree(
  items: readonly ProfileItemDefinition[],
  matchByKey: ReadonlyMap<string, LeafMatch | null>,
  isLit: (nodeId: string) => boolean,
  practiceValueByKey: ReadonlyMap<string, number> = new Map(),
): OverlapNode[] {
  const leafKeys = leafKeysOf(items);
  const childrenByParent = new Map<string | null, ProfileItemDefinition[]>();
  for (const item of items) {
    const siblings = childrenByParent.get(item.parentKey) ?? [];
    siblings.push(item);
    childrenByParent.set(item.parentKey, siblings);
  }

  function build(item: ProfileItemDefinition): OverlapNode {
    const kind = item.kind ?? "knowledge";
    if (leafKeys.has(item.key)) {
      if (kind === "practice") {
        const value = practiceValueByKey.get(item.key) ?? 0;
        return {
          key: item.key,
          label: item.label,
          sourceRef: item.sourceRef,
          isLeaf: true,
          kind,
          leafCount: 1,
          matchedLeafCount: value,
          ratio: value,
          match: null,
          children: [],
        };
      }
      const match = matchByKey.get(item.key) ?? null;
      // "tool" survives only in pre-029 stored rows — same entity semantics as hub.
      if (kind === "hub" || kind === "tool" || kind === "structure") {
        // Undecomposed hub (or a structure item that ended up childless): out of every
        // denominator; the match survives as a 线索 only.
        return {
          key: item.key,
          label: item.label,
          sourceRef: item.sourceRef,
          isLeaf: true,
          kind,
          leafCount: 0,
          matchedLeafCount: 0,
          ratio: 0,
          match,
          children: [],
        };
      }
      const overlapping = match !== null && isLit(match.nodeId);
      return {
        key: item.key,
        label: item.label,
        sourceRef: item.sourceRef,
        isLeaf: true,
        kind,
        leafCount: 1,
        matchedLeafCount: overlapping ? 1 : 0,
        ratio: overlapping ? 1 : 0,
        match,
        children: [],
      };
    }
    const children = (childrenByParent.get(item.key) ?? []).map(build);
    const leafCount = children.reduce((sum, child) => sum + child.leafCount, 0);
    const matchedLeafCount = children.reduce((sum, child) => sum + child.matchedLeafCount, 0);
    return {
      key: item.key,
      label: item.label,
      sourceRef: item.sourceRef,
      isLeaf: false,
      kind,
      leafCount,
      matchedLeafCount,
      ratio: leafCount === 0 ? 0 : matchedLeafCount / leafCount,
      match: null,
      children,
    };
  }

  return (childrenByParent.get(null) ?? []).map(build);
}
