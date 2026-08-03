/**
 * Purpose: public entry of the knowledge-tree plugin (headless logic only — UI lives in
 * the desktop app).
 * Main exports: extraction contract, tree-attachment planning, and the spec-015 node-dedup
 * synonym gate.
 */
export * from "./attach";
export * from "./extraction";
export * from "./synonymGate";
