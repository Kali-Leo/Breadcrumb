/**
 * Purpose: public entry of the external-content channel layer (headless — the discovery UI lives
 * in apps/desktop).
 * Main exports: the candidate-item contract (candidateItem.ts), the channel catalog format and
 * starter catalog (channelCatalog.ts), the fetch-discipline layer (fetchContract.ts,
 * fetchBudget.ts, boundedBody.ts, channelFetcher.ts), reachability probing (reachabilityProbe.ts),
 * and the generic RSS/Atom/JSON-Feed adapter (genericFeedAdapter.ts and its helpers).
 */
export * from "./boundedBody";
export * from "./candidateItem";
export * from "./channelCatalog";
export * from "./channelFetcher";
export * from "./feedSchemas";
export * from "./feedText";
export * from "./fetchBudget";
export * from "./fetchContract";
export * from "./genericFeedAdapter";
export * from "./genericFeedItemMapping";
export * from "./reachabilityProbe";
