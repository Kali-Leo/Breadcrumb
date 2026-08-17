/**
 * Purpose: find out cheaply whether a source answers at all from wherever the reader is sitting.
 * Reachability is a runtime property, not a property of the catalog: an unreachable source is
 * skipped silently, so this never throws and never reports an error upward.
 * Main exports: reachabilityResultSchema, probeSourceReachability, ReachabilityResult.
 */
import { z } from "zod";
import type { ChannelSource } from "./channelCatalog";
import {
  buildDefaultUserAgent,
  defaultRequestTimeoutMilliseconds,
  type FetchImplementation,
} from "./fetchContract";

export const reachabilityResultSchema = z.object({
  sourceId: z.string().min(1),
  reachable: z.boolean(),
  checkedAt: z.iso.datetime(),
});

export type ReachabilityResult = z.infer<typeof reachabilityResultSchema>;

export interface ReachabilityProbeOptions {
  fetchImplementation: FetchImplementation;
  userAgent?: string;
  /** Short on purpose — a probe that hangs is as useless as a source that is down. */
  timeoutMilliseconds?: number;
  now?: () => Date;
}

async function requestAndDiscardBody(
  fetchImplementation: FetchImplementation,
  url: string,
  init: RequestInit,
): Promise<number> {
  const response = await fetchImplementation(url, init);
  await response.body?.cancel().catch(() => undefined);
  return response.status;
}

/**
 * HEAD first because it costs one round trip and no payload; several feed hosts answer HEAD with
 * 405 or 501, so those fall back to a GET whose first kilobyte is enough and whose body we drop.
 */
export async function probeSourceReachability(
  source: ChannelSource,
  options: ReachabilityProbeOptions,
): Promise<ReachabilityResult> {
  const url = source.endpoint.feedUrl;
  const userAgent =
    source.fetchPolicy.userAgentOverride ?? options.userAgent ?? buildDefaultUserAgent();
  const timeoutMilliseconds = options.timeoutMilliseconds ?? defaultRequestTimeoutMilliseconds;
  const checkedAt = (options.now?.() ?? new Date()).toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);
  const headers: Record<string, string> = { "User-Agent": userAgent };

  try {
    const headStatus = await requestAndDiscardBody(options.fetchImplementation, url, {
      method: "HEAD",
      headers,
      redirect: "follow",
      signal: controller.signal,
    }).catch(() => null);
    if (headStatus !== null && headStatus < 400) {
      return { sourceId: source.id, reachable: true, checkedAt };
    }
    const getStatus = await requestAndDiscardBody(options.fetchImplementation, url, {
      method: "GET",
      headers: { ...headers, Range: "bytes=0-1023" },
      redirect: "follow",
      signal: controller.signal,
    }).catch(() => null);
    return {
      sourceId: source.id,
      reachable: getStatus !== null && getStatus < 400,
      checkedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}
