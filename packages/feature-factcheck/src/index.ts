/**
 * Purpose: public surface of the headless fact-check module.
 * Main exports: runFactCheck pipeline, claim/verdict contracts, evidence providers.
 */

export { type BingProviderOptions, createBingProvider } from "./evidence/bing";
export {
  createDefaultEvidenceProviders,
  type DefaultProvidersOptions,
} from "./evidence/defaults";
export { createDuckDuckGoProvider, type DuckDuckGoProviderOptions } from "./evidence/duckduckgo";
export { EVIDENCE_WINDOW_LENGTH, extractKeywordWindow } from "./evidence/pageText";
export {
  type EvidenceItem,
  type EvidenceProvider,
  type EvidenceSearchResult,
  type FetchInit,
  type FetchLike,
  stripHtml,
} from "./evidence/provider";
export {
  fetchExternalPage,
  isFetchableUrl,
  MAX_RESPONSE_BYTES,
} from "./evidence/safeFetch";
export { createWikipediaProvider, type WikipediaProviderOptions } from "./evidence/wikipedia";
export {
  buildClaimExtractionMessages,
  claimExtractionSchema,
  type ExtractedClaim,
} from "./extraction";
export { type GatheredEvidence, gatherEvidence } from "./gathering";
export {
  type CheckedClaim,
  type FactCheckDeps,
  type FactCheckReport,
  runFactCheck,
} from "./pipeline";
export { seededShuffle } from "./shuffle";
export {
  buildVerdictMessages,
  type ClaimRelationship,
  createVerdictSchema,
  VERDICT_RELATIONSHIPS,
  type VerdictRelationship,
} from "./verdict";
