/**
 * Purpose: public surface of the browsing-interest module — the event contract, the two
 * classification layers, the interest profile, the store the app keeps them in, and the pure
 * math behind the four panels. No UI here; the panels live in apps/desktop.
 */
export {
  AFFINITY_RELATIVE_GATE_FRACTION,
  BROWSING_RECENCY_HALF_LIFE_DAYS,
  browsingAffinityByNode,
  MIN_AFFINITY_EXCESS,
  type WatchedTitleSignal,
  type WatchedTitleVector,
  watchedTitleSignals,
  watchedTitleWeight,
} from "./affinity";
export {
  type BrowsingProfileInput,
  buildBrowsingProfile,
  DRIVER_ITEM_COUNT,
  DRIVER_TOPIC_COUNT,
  PROFILE_API_VERSION,
} from "./browsingProfile";
export {
  CLASSIFIER_MODEL,
  CLASSIFIER_PREFIX,
  type ClassifierHead,
  COEFFICIENT_EMOTION_LABELS,
  COEFFICIENT_TOPIC_LABELS,
  classifyTexts,
  classifyVectors,
  decodeHead,
  type EmbeddingClassification,
  type EmbedTexts,
  emotionClassifierHead,
  MAX_CLASSIFY_CHARS,
  type QuantisedHead,
  scoreVector,
  topicClassifierHead,
} from "./classifier";
export {
  type ClassificationInput,
  type ClassifierLayer,
  isDistribution,
  type LayerOutput,
  needsEmbeddingUpgrade,
  type ResolvedClassification,
  resolveClassification,
} from "./classifierLayers";
export {
  buildEmotionChart,
  EMOTION_CHART_HEIGHT,
  EMOTION_CHART_WIDTH,
  type EmotionChart,
  type EmotionChartLine,
  type EmotionSeriesKey,
  findNearestChartPoint,
  type NearestChartPoint,
} from "./emotionChart";
export {
  BROWSING_EVENTS_MIGRATION,
  type BrowsingEventStore,
  createBrowsingEventStore,
  type SqlClient,
} from "./eventStore";
export {
  type BrowsingEvent,
  type BrowsingEventRow,
  browsingEventSchema,
  classificationOf,
  type EventClassification,
  MAX_EVENT_AGE_SECONDS,
  MAX_EVENT_SKEW_SECONDS,
  normalizeEvent,
  trustedEventTime,
} from "./events";
export { countsL2Norm, hashedNgramCounts, murmurHash3, NGRAM_MAX, NGRAM_MIN } from "./hashing";
export {
  type EmotionCategory,
  type EmotionSeriesOptions,
  emotionSeries,
} from "./panels/emotionSeries";
export {
  MIN_ENGAGED_FOR_NEW_INTERESTS,
  MIN_NEW_INTEREST_SHARE,
  NEW_INTEREST_ITEM_DAYS,
  NEW_INTEREST_RISE,
  type NewInterestsInput,
  newInterests,
} from "./panels/newInterests";
export {
  PRO_FINISHED_FRACTION,
  PRO_LIST_LIMIT,
  PRO_NO_DURATION_FINISHED_SECONDS,
  PRO_STARTED_SECONDS,
  type ProContentOptions,
  proContentPanel,
} from "./panels/proContentPanel";
export {
  titleWords,
  WORD_CLOUD_LIMIT,
  type WordCloudOptions,
  wordCloudWords,
} from "./panels/wordCloudWords";
export {
  type GroupCount,
  groupCounts,
  thumbnailUrl,
  videoUrl,
  watchedMinutes,
  watchedPercent,
} from "./proContent";
export {
  applyEvent,
  type BrowsingEventType,
  type ClockPolicy,
  createProfileState,
  DAEMON_CLOCK,
  type DecayHalfLives,
  decayProfile,
  eventWeight,
  type InterestProfileState,
  ingestEvent,
  LITE_CLOCK,
  LONG_HALF_LIFE_SECONDS,
  SHORT_HALF_LIFE_SECONDS,
} from "./profileEngine";
export {
  exposureLift,
  MAX_TOPIC_PREFERENCE,
  MIN_EXPOSURE_SHARE,
  MIN_TOPIC_PREFERENCE,
  normalizeShares,
  type ProfileDistributions,
  profileDistributions,
  setTopicPreference,
  topDriverTopics,
  topicAffinity,
} from "./profileShares";
export type {
  BrowsingProfile,
  CloudWord,
  EmotionPoint,
  EmotionSeries,
  NewInterests,
  ProContent,
  ProContentItem,
  WordCloud,
} from "./schemas";
export {
  EMOTION_COUNT,
  EMOTION_NAMES,
  EMOTION_NAMES_EN,
  EMOTION_VALENCES,
  englishLeafName,
  groupOfTopic,
  PRO_GROUPS,
  PRO_TOPIC_INDICES,
  TOPIC_GROUP_NAMES_EN,
  TOPIC_GROUPS,
  TOPIC_LEAF_NAMES_EN,
  TOPIC_LEAVES,
} from "./taxonomy";
export {
  classifierText,
  TOPIC_BIAS,
  TOPIC_COUNT,
  TOPIC_DIMENSIONS,
  TOPIC_WEIGHT_SCALE,
  topicProbabilities,
} from "./topicModel";
export { englishTopicNames, topicLabel } from "./topicNames";
export {
  BROWSING_TRUST_DEFAULT,
  BROWSING_TRUST_MAX,
  BROWSING_TRUST_MIN,
  type HindsightEvent,
  hindsightTrustRatio,
  MIN_OUTCOME_EVENTS,
  midrankPercentile,
} from "./trustRatio";
export {
  layoutWordCloud,
  type PlacedWord,
  valenceColor,
  type WordCloudLayoutInput,
  wordFontWeight,
} from "./wordCloudLayout";
