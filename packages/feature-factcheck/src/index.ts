/**
 * Purpose: public surface of the headless grounding module — the evidence layer that fetches
 * a topic's source material, and the grounding layer that labels an answer's sentences
 * against it. No model call lives in here: every judgement this package makes is mechanical.
 * Main exports: evidence providers, topic retrieval and passages, sentence alignment, and the
 * per-sentence grounding annotation.
 */

export { type BingProviderOptions, createBingProvider } from "./evidence/bing";
export {
  createDefaultEvidenceProviders,
  type DefaultProvidersOptions,
  type EvidenceEdition,
} from "./evidence/defaults";
export { createDuckDuckGoProvider, type DuckDuckGoProviderOptions } from "./evidence/duckduckgo";
export {
  EVIDENCE_WINDOW_LENGTH,
  extractKeywordWindow,
  keywordWindowOfText,
  queryTerms,
} from "./evidence/pageText";
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
export { createWikidataProvider, type WikidataProviderOptions } from "./evidence/wikidata";
export {
  type FactParts,
  type FactRenderer,
  neutralFactRenderer,
} from "./evidence/wikidataRender";
export { wikidataLanguagesOf, wikiEditionOf } from "./evidence/wikimedia";
export { createWikipediaProvider, type WikipediaProviderOptions } from "./evidence/wikipedia";
export {
  createZhipuSearchProvider,
  ZHIPU_SEARCH_LANGUAGES,
  ZHIPU_SEARCH_PRICE_CNY,
  type ZhipuProviderOptions,
  zhipuSupportsLanguage,
} from "./evidence/zhipu";
export { type GatheredEvidence, gatherEvidence } from "./gathering";
export {
  ALIGN_MIN_TOKENS,
  ALIGN_OVERLAP_THRESHOLD,
  ALIGN_VECTOR_THRESHOLD,
  alignSentences,
  type PassageSentence,
  passageSentences,
  type SentenceMatch,
} from "./grounding/align";
export {
  type AnnotateInput,
  type AnswerGrounding,
  annotateAnswer,
  answerSentencesOf,
  type GroundedSentence,
  type GroundingLabel,
} from "./grounding/annotate";
export { ENTITY_MIN_CHARS, entityTokens, pairingHolds, quoteExistsIn } from "./grounding/checks";
export { findConflict, type SourceConflict } from "./grounding/conflict";
export { TOPIC_ENTITY_MIN_CHARS, topicEntities } from "./grounding/entities";
export {
  buildTopicPassages,
  formatPassageBlock,
  LIBRARY_SOURCE,
  orderForAttention,
  TOPIC_PASSAGE_COUNT,
  type TopicPassage,
} from "./grounding/passages";
export {
  maskMarkdown,
  SENTENCE_MIN_CHARS,
  type SentenceSpan,
  splitSentences,
} from "./grounding/sentences";
export { contentTokens, isWholeWord, overlapCoefficient, tokenizeText } from "./grounding/tokens";
export {
  bestTopicSimilarity,
  TOPIC_KEEP_THRESHOLD,
  topicStillCovered,
} from "./grounding/topicDrift";
export {
  gatherTopicEvidence,
  MAX_TOPIC_QUERIES,
  TOPIC_QUERY_MAX_CHARS,
  topicQueries,
} from "./grounding/topicSearch";
export { type SpecificValue, specificValues, ungroundedValues } from "./grounding/values";
