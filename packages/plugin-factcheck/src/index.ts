/**
 * Purpose: public surface of the headless fact-check plugin.
 * Main exports: runFactCheck pipeline, claim/verdict contracts, evidence providers.
 */

export { createDuckDuckGoProvider, type DuckDuckGoProviderOptions } from "./evidence/duckduckgo";
export {
  type EvidenceItem,
  type EvidenceProvider,
  type FetchLike,
  stripHtml,
} from "./evidence/provider";
export { createWikipediaProvider, type WikipediaProviderOptions } from "./evidence/wikipedia";
export {
  buildClaimExtractionMessages,
  claimExtractionSchema,
  type ExtractedClaim,
} from "./extraction";
export {
  type CheckedClaim,
  type FactCheckDeps,
  type FactCheckReport,
  runFactCheck,
} from "./pipeline";
export { buildVerdictMessages, type ClaimRelationship, verdictSchema } from "./verdict";
