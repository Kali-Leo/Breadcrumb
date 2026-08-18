/**
 * Purpose: public entry of the external-content channel layer (headless — the discovery UI lives
 * in apps/desktop).
 * Main exports: the candidate-item contract (candidateItem.ts), the channel catalog format and
 * starter catalog (channelCatalog.ts), the fetch-discipline layer (fetchContract.ts,
 * fetchBudget.ts, boundedBody.ts, channelFetcher.ts, requestPacer.ts), reachability probing
 * (reachabilityProbe.ts), the adapters — generic RSS/Atom/JSON Feed, Discourse, V2EX, Hacker News
 * over Algolia, arXiv, iTunes podcast search and category charts, YouTube channels and oEmbed,
 * bilibili rankings, Wikipedia featured content — and the two calls the discovery pipeline runs
 * against: fetchLatestFromSource and searchTopics.
 */
export * from "./adapterCapabilities";
export * from "./arxivAdapter";
export * from "./bilibiliRankingAdapter";
export * from "./boundedBody";
export * from "./candidateItem";
export * from "./channelCatalog";
export * from "./channelFetcher";
export * from "./discourseAdapter";
export * from "./discourseTopic";
export * from "./feedSchemas";
export * from "./feedText";
export * from "./fetchBudget";
export * from "./fetchContract";
export * from "./genericFeedAdapter";
export * from "./genericFeedItemMapping";
export * from "./hackerNewsAdapter";
export * from "./jsonPayload";
export * from "./podcastChartAdapter";
export * from "./podcastChartDirectory";
export * from "./podcastSearchAdapter";
export * from "./reachabilityProbe";
export * from "./requestPacer";
export * from "./requestRateWindow";
export * from "./sourceFetchFacade";
export * from "./sourceFetchResult";
export * from "./topicSearch";
export * from "./upstreamSignal";
export * from "./v2exAdapter";
export * from "./wikipediaFeaturedAdapter";
export * from "./youtubeChannelAdapter";
