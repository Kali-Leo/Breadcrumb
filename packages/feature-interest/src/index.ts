/**
 * Purpose: public entry of the interest module (headless logic only — UI lands in spec 012).
 * Main exports: LLM extraction contract (extraction.ts), decay aggregation and style
 * ranking (aggregate.ts), embedding-similarity diffusion (spread.ts), self-report mastery
 * mapping (selfReport.ts).
 */
export * from "./aggregate";
export * from "./extraction";
export * from "./pseudoCount";
export * from "./selfReport";
export * from "./spread";
