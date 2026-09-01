/**
 * Purpose: combines the demo seed's four node-spec buckets (spec 035 T7b) into the one list
 * concepts.ts's builder consumes.
 * Main exports: ConceptSpec, ALL_CONCEPT_SPECS.
 */
export type { ConceptSpec } from "./conceptSpecTypes";

import { DEEP_TREE } from "./conceptSpecsDeepTree";
import { FRESH } from "./conceptSpecsFresh";
import { MASTERED } from "./conceptSpecsMastered";
import { WAITING } from "./conceptSpecsWaiting";
import type { ConceptSpec } from "./conceptSpecTypes";

export const ALL_CONCEPT_SPECS: readonly ConceptSpec[] = [
  ...MASTERED,
  ...WAITING,
  ...FRESH,
  ...DEEP_TREE,
];
