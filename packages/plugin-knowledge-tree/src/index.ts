/**
 * Purpose: public entry of the knowledge-tree plugin (headless logic only — UI lives in
 * the desktop app).
 * Main exports: extraction contract, tree-attachment planning, the spec-015 node-dedup
 * synonym gate, and the read-only suspect-pair scan for the lab panel.
 */
export * from "./attach";
export * from "./extraction";
export * from "./suspectPairs";
export * from "./synonymGate";
