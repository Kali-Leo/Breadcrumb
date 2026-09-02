/**
 * Purpose: evidence gathering for one claim — walk the provider chain per query under a fair
 * per-query quota, de-duplicate by URL, and keep an honest record of which providers failed
 * so the pipeline can tell "查不到" apart from "查不了".
 * Main exports: gatherEvidence, GatheredEvidence.
 */
import type { EvidenceItem, EvidenceProvider } from "./evidence/provider";

export interface GatheredEvidence {
  items: EvidenceItem[];
  /** True when every search we issued failed. Nothing was learned about the world. */
  searchFailed: boolean;
  /** Names of providers that failed at least once this claim — the host logs these. */
  failedProviders: string[];
}

export async function gatherEvidence(
  providers: readonly EvidenceProvider[],
  queries: readonly string[],
  maxEvidence: number,
): Promise<GatheredEvidence> {
  const items: EvidenceItem[] = [];
  const seenUrls = new Set<string>();
  const failedProviders = new Set<string>();
  let anyProviderAnswered = false;
  // Fair share per query: one badly-phrased query must not fill the whole quota.
  const perQueryCap = Math.ceil(maxEvidence / Math.max(queries.length, 1));
  for (const query of queries) {
    let takenForQuery = 0;
    for (const provider of providers) {
      if (items.length >= maxEvidence || takenForQuery >= perQueryCap) break;
      const result = await provider.search(
        query,
        Math.min(perQueryCap - takenForQuery, maxEvidence - items.length),
      );
      if (result.failed) failedProviders.add(provider.name);
      else anyProviderAnswered = true;
      for (const item of result.items) {
        if (!seenUrls.has(item.url) && items.length < maxEvidence && takenForQuery < perQueryCap) {
          seenUrls.add(item.url);
          items.push(item);
          takenForQuery += 1;
        }
      }
    }
  }
  return {
    items,
    // Only when searches were actually attempted and not one of them came back: with no
    // providers configured at all there is nothing to report as broken.
    searchFailed: !anyProviderAnswered && failedProviders.size > 0,
    failedProviders: [...failedProviders],
  };
}
