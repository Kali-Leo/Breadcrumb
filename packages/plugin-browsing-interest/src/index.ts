/**
 * Purpose: public surface of the browsing-interest plugin — the service contract and the
 * pure math behind the panels. No UI here; the panels live in apps/desktop.
 */
export {
  type BrowsingInterestClient,
  BrowsingInterestServiceError,
  createBrowsingInterestClient,
  DEFAULT_SERVICE_URL,
  type EmotionCategory,
  type ServiceFailure,
  type ServiceFetch,
} from "./client";
export {
  buildEmotionChart,
  EMOTION_CHART_HEIGHT,
  EMOTION_CHART_WIDTH,
  type EmotionChart,
  type EmotionChartLine,
  type EmotionSeriesKey,
  findNearestChartPoint,
  formatDayLabel,
  type NearestChartPoint,
} from "./emotionChart";
export {
  type GroupCount,
  groupCounts,
  thumbnailUrl,
  videoUrl,
  watchedMinutes,
  watchedPercent,
} from "./proContent";
export {
  type BrowsingProfile,
  browsingProfileSchema,
  type CloudWord,
  type EmotionPoint,
  type EmotionSeries,
  emotionSeriesSchema,
  type NewInterests,
  newInterestsSchema,
  type ProContent,
  type ProContentItem,
  proContentSchema,
  type WordCloud,
  wordCloudSchema,
} from "./schemas";
export {
  layoutWordCloud,
  type PlacedWord,
  valenceColor,
  type WordCloudLayoutInput,
  wordFontWeight,
} from "./wordCloudLayout";
