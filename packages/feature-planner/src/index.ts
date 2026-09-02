/**
 * Purpose: public entry of the planner module (headless logic only — UI lives in the
 * desktop app's experimental lab panel).
 * Main exports: the no-goal frontier query (frontier.ts + frontierScore.ts, ranked-mode
 * goal-gap boost), the shared structural-depth helper (graphDepth.ts),
 * goal-driven gap/route/coverage query (gapAndPath.ts), the LLM goal-mapping contract
 * (goalMapping.ts), one-hop reverse interest propagation (propagate.ts), and the
 * single-route recommendation (recommendRoute.ts).
 */
export * from "./frontier";
export * from "./gapAndPath";
export * from "./goalMapping";
export * from "./graphDepth";
export * from "./propagate";
export * from "./recommendRoute";
export * from "./visibleCount";
