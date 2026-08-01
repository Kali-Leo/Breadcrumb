/**
 * Purpose: public entry of the planner plugin (headless logic only — UI lives in the
 * desktop app's experimental lab panel).
 * Main exports: the no-goal frontier query (frontier.ts), goal-driven gap/route/coverage
 * query (gapAndPath.ts), and the LLM goal-mapping contract (goalMapping.ts).
 */
export * from "./frontier";
export * from "./gapAndPath";
export * from "./goalMapping";
