/**
 * Purpose: the demo seed's deep-subtree bucket — a multi-level
 * branch under the existing higher-order-array-methods kingdom so the third-level network
 * view has a real tree to render: two freshly-met nodes, the rest untouched (empty offsets =
 * no sightings, an honest "never met").
 * Main exports: DEEP_TREE.
 */
import type { ConceptSpec } from "./conceptSpecTypes";
import type { ConceptId } from "./text/demoText";

const js = (
  id: ConceptId,
  parentId: ConceptId,
  offsetsDays: readonly number[] = [],
): ConceptSpec => ({ id, domain: "js", parentId, offsetsDays });

export const DEEP_TREE: readonly ConceptSpec[] = [
  // Level 2 — the kingdom's three main lines.
  js("array-map", "array-higher-order", [3]),
  js("array-filter", "array-higher-order"),
  js("array-reduce", "array-higher-order"),
  // Level 3.
  js("method-chaining", "array-map", [2]),
  js("sparse-arrays", "array-map"),
  js("predicate-functions", "array-filter"),
  js("truthiness", "array-filter"),
  js("accumulator-pattern", "array-reduce"),
  js("reduce-initial-value", "array-reduce"),
  js("map-via-reduce", "array-reduce"),
  // Level 4.
  js("group-by", "accumulator-pattern"),
  js("object-accumulator", "accumulator-pattern"),
  js("lazy-evaluation-tradeoff", "method-chaining"),
  js("composing-predicates", "predicate-functions"),
  // Level 5.
  js("map-or-object", "group-by"),
];
