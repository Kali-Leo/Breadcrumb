/**
 * Purpose: public entry of the knowledge-tree plugin (headless logic only — UI lives in
 * the desktop app).
 * Main exports: extraction contract, tree-attachment planning, the spec-015 node-dedup
 * synonym gate, the suspect-pair scan (embedding-similarity candidates for the LLM merge
 * tier), and the mechanical/LLM-verdict merge planners for spec 015 #4's auto-merge sweep.
 */
export * from "./attach";
export * from "./extraction";
export * from "./mergePlan";
export * from "./suspectPairs";
export * from "./synonymGate";
