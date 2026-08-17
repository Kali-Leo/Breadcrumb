/**
 * Purpose: public entry of the discovery-feed plugin (headless logic only — the feed's UI
 * lives in apps/desktop).
 * Main exports: interest folding (interestModel.ts), centroid similarity scoring
 * (scoring.ts), the item's own ranking features (contentFeatures.ts, spec 053 §4), Thompson
 * explore-topic sampling (thompson.ts), MMR diversity reranking with topic/channel/form quotas
 * (mmr.ts), the guaranteed exploration share (explorationQuota.ts), the batch quality-check LLM
 * contract (qualityCheckPrompts.ts, spec 053 §5), and the retired self-generation prompt
 * contracts (cardPrompts.ts, articlePrompts.ts).
 */
export * from "./articlePrompts";
export * from "./cardPrompts";
export * from "./contentFeatures";
export * from "./explorationQuota";
export * from "./interestModel";
export * from "./mmr";
export * from "./qualityCheckPrompts";
export * from "./scoring";
export * from "./thompson";
