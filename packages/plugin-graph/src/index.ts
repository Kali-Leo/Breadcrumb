/**
 * Purpose: public entry of the knowledge-graph plugin (headless logic only — UI lives in
 * the desktop app).
 * Main exports: graph queries (graph.ts), candidate ranking (similarity.ts), and the
 * LLM edge-judge contract (edgeJudge.ts).
 */
export * from "./edgeJudge";
export * from "./graph";
export * from "./similarity";
