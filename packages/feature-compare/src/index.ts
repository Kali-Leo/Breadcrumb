/**
 * Purpose: public entry of the comparison-tree module (headless logic only — UI lives in
 * the desktop app's lab panel). The module is standalone by design (spec 023): it shares
 * no logic with the planner, ladder, or goals.
 * Main exports: profile definition schema/validation (profileSchema.ts), conservative
 * leaf matching (matching.ts), overlap aggregation (overlap.ts), the experimental
 * search-build contract with URL-verification pruning (searchBuild.ts), and the semantic
 * alignment engine (alignment.ts, spec 024).
 */
export * from "./alignment";
export * from "./anchorDormancy";
export * from "./escoKnowledgeBranch";
export * from "./matching";
export * from "./occupationProfile";
export * from "./overlap";
export * from "./profileSchema";
export * from "./searchBuild";
export * from "./subtreeMount";
