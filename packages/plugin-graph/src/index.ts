/**
 * Purpose: public entry of the knowledge-graph plugin (headless logic only — UI lives in
 * the desktop app).
 * Main exports: graph queries — wouldCreateCycle, prerequisiteClosure, topologicalOrder,
 * outgoingNeighbors, incomingNeighbors.
 */
export * from "./graph";
