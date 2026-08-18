/**
 * Purpose: the first two steps of Apple's key-free podcast pipeline — a category chart, and the
 * lookup that turns the chart's show ids into the shows' own RSS addresses. The 2026-08-18 content
 * survey verified all of it anonymously: 教育 (1304), 历史 (1487) and 科学 (1533) each answer with
 * 50 shows carrying artwork, and `lookup` returned a `feedUrl` for every one of them. This replaces
 * hand-listing podcasts: the charts restate themselves as the stores move, and 小宇宙 shows hand
 * back their official feed.xyzfm.space address here rather than nowhere.
 * Main exports: itunesChartGenres, buildPodcastChartUrl, parsePodcastChartEntries,
 * buildItunesLookupUrl, lookupPodcastFeedUrls, itunesRateWindow, upgradeItunesArtwork.
 */
import { z } from "zod";
import { firstNonEmptyText } from "./feedText";
import { type FetchContext, jsonAcceptHeader } from "./fetchContract";
import { parseJsonPayload } from "./jsonPayload";
import { itunesResultSchema } from "./podcastSearchAdapter";
import { RequestRateWindow } from "./requestRateWindow";

/** The three learning categories the survey verified. The country top-50 is deliberately absent:
 * the survey found it dominated by chat shows, which is not what this feed is for. */
export const itunesChartGenres = {
  education: 1304,
  history: 1487,
  science: 1533,
} as const;

export const itunesLookupUrl = "https://itunes.apple.com/lookup";

/**
 * iTunes answers roughly twenty calls a minute before it starts refusing. Shared across catalog
 * entries, because the limit belongs to the client rather than to one chart. By construction the
 * pipeline never comes near it — a chart poll makes two calls and the catalog lets each chart be
 * read four times a day — so this is a guard against a future catalog, not a throttle on this one.
 */
export const itunesRateWindow = new RequestRateWindow({
  maximumRequests: 20,
  windowMilliseconds: 60_000,
});

export function buildPodcastChartUrl(country: string, genreId: number, limit = 50): string {
  return `https://itunes.apple.com/${country}/rss/toppodcasts/limit=${limit}/genre=${genreId}/json`;
}

const labelSchema = z.object({ label: z.string().nullish() });

const chartEntrySchema = z.object({
  "im:name": labelSchema.nullish(),
  "im:artist": labelSchema.nullish(),
  "im:image": z.array(z.object({ label: z.string().nullish() })).nullish(),
  id: z.object({ attributes: z.object({ "im:id": z.string().nullish() }).nullish() }).nullish(),
  link: z.object({ attributes: z.object({ href: z.string().nullish() }).nullish() }).nullish(),
});

const chartResponseSchema = z.object({
  feed: z.object({ entry: z.array(z.unknown()).nullish() }).nullish(),
});

/**
 * Charts offer artwork at 55, 60 and 170 pixels, all of them too small for a card. The size is a
 * path segment Apple renders on demand — swapping it for 600 was measured answering 200 on
 * 2026-08-18 — so the largest listed size is rewritten rather than guessed at from scratch.
 */
export function upgradeItunesArtwork(url: string | null): string | null {
  if (url === null) return null;
  return url.replace(/\/\d+x\d+bb\.(png|jpg)$/i, "/600x600bb.$1");
}

export interface PodcastChartEntry {
  /** Apple's collection id, the key the lookup call takes. */
  collectionId: string;
  showName: string;
  artworkUrl: string | null;
  /** The show's page in Apple Podcasts. */
  storeUrl: string | null;
}

/** Entries with no id are dropped: without one there is no way to reach the show's own feed. */
export function parsePodcastChartEntries(body: string): PodcastChartEntry[] {
  const payload = parseJsonPayload(body);
  if (!payload.ok) return [];
  const response = chartResponseSchema.safeParse(payload.value);
  if (!response.success) return [];
  const entries: PodcastChartEntry[] = [];
  for (const raw of response.data.feed?.entry ?? []) {
    const parsed = chartEntrySchema.safeParse(raw);
    if (!parsed.success) continue;
    const collectionId = firstNonEmptyText(parsed.data.id?.attributes?.["im:id"]);
    const showName = firstNonEmptyText(
      parsed.data["im:name"]?.label,
      parsed.data["im:artist"]?.label,
    );
    if (collectionId === null || showName === null) continue;
    const images = parsed.data["im:image"] ?? [];
    const largest =
      images.length === 0 ? null : firstNonEmptyText(images[images.length - 1]?.label);
    entries.push({
      collectionId,
      showName,
      artworkUrl: upgradeItunesArtwork(largest),
      storeUrl: firstNonEmptyText(parsed.data.link?.attributes?.href),
    });
  }
  return entries;
}

export function buildItunesLookupUrl(collectionIds: readonly string[]): string {
  const url = new URL(itunesLookupUrl);
  url.searchParams.set("id", collectionIds.join(","));
  url.searchParams.set("entity", "podcast");
  return url.toString();
}

const lookupResponseSchema = z.object({ results: z.array(z.unknown()) });

/**
 * One call resolves every id given. Shows whose entry carries no `feedUrl` are simply absent from
 * the map — a show we cannot subscribe to is not a result — and a refused or unreadable call comes
 * back as an empty map rather than as an error, because a poll degrades and does not raise.
 */
export async function lookupPodcastFeedUrls(
  collectionIds: readonly string[],
  context: FetchContext,
): Promise<Map<string, string>> {
  const feedUrls = new Map<string, string>();
  if (collectionIds.length === 0) return feedUrls;
  const outcome = await context.fetchUrl(buildItunesLookupUrl(collectionIds), {
    kind: "follow-up",
    accept: jsonAcceptHeader,
  });
  if (outcome.status !== "fetched") return feedUrls;
  const payload = parseJsonPayload(outcome.body);
  if (!payload.ok) return feedUrls;
  const response = lookupResponseSchema.safeParse(payload.value);
  if (!response.success) return feedUrls;
  for (const raw of response.data.results) {
    const parsed = itunesResultSchema.safeParse(raw);
    if (!parsed.success) continue;
    const collectionId = parsed.data.collectionId;
    const feedUrl = firstNonEmptyText(parsed.data.feedUrl);
    if (collectionId === null || collectionId === undefined || feedUrl === null) continue;
    feedUrls.set(String(collectionId), feedUrl);
  }
  return feedUrls;
}
