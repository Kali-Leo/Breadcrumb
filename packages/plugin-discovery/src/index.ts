/**
 * Purpose: public entry of the discovery-feed plugin (headless logic only — UI lands in spec
 * 051's desktop tasks T5-T9).
 * Main exports: interest folding (interestModel.ts), centroid similarity scoring
 * (scoring.ts), Thompson explore-topic sampling (thompson.ts), MMR diversity reranking
 * (mmr.ts), the batch quality-check LLM contract (qualityCheckPrompts.ts, spec 053 §5), and
 * the retired self-generation prompt contracts (cardPrompts.ts, articlePrompts.ts).
 */
export * from "./articlePrompts";
export * from "./cardPrompts";
export * from "./interestModel";
export * from "./mmr";
export * from "./qualityCheckPrompts";
export * from "./scoring";
export * from "./thompson";
