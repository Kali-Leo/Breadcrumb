/**
 * Purpose: default evidence-provider chain per network environment — mainland China gets
 * reachable-only sources (Bing CN); elsewhere Wikipedia leads for quality with fallbacks.
 * Main exports: createDefaultEvidenceProviders.
 */
import { createBingProvider } from "./bing";
import { createDuckDuckGoProvider } from "./duckduckgo";
import type { EvidenceProvider, FetchLike } from "./provider";
import { createWikipediaProvider } from "./wikipedia";

export interface DefaultProvidersOptions {
  fetchImpl: FetchLike;
  /** True when the user is on a mainland-China network where Wikipedia/DuckDuckGo are
   * unreachable — querying them would only burn timeouts before every fallback. */
  mainlandChina: boolean;
  timeoutMs?: number;
}

export function createDefaultEvidenceProviders(
  options: DefaultProvidersOptions,
): EvidenceProvider[] {
  const shared = { fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs };
  if (options.mainlandChina) {
    return [createBingProvider(shared)];
  }
  return [
    createWikipediaProvider(shared),
    createBingProvider(shared),
    createDuckDuckGoProvider(shared),
  ];
}
