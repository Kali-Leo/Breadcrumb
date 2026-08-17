/**
 * Purpose: the outside world a journey reads from — every subscribed feed publishing a fresh day's
 * items over a rolling backlog, plus the Hacker News endpoints polling and active recall use.
 * Registered into a FakeChannelNetwork; nothing here touches a socket.
 * Main exports: HACKER_NEWS_POLL_URL, HACKER_NEWS_SEARCH_PREFIX, SyntheticWorld,
 * createSyntheticWorld.
 */
import type { FakeChannelNetwork } from "./fakeChannelNetwork";
import {
  buildAlgoliaResponse,
  buildAtomFeed,
  buildJsonFeed,
  buildRssFeed,
  type FeedItemSpec,
} from "./syntheticFeeds";
import { JOURNEY_FEEDS, type TopicFeed } from "./topicFeedCatalog";

export * from "./topicFeedCatalog";

export const HACKER_NEWS_POLL_URL = "https://hn.algolia.com/api/v1/search?tags=front_page";
export const HACKER_NEWS_SEARCH_PREFIX = "https://hn.algolia.com/api/v1/search_by_date";
export const HACKER_NEWS_TOPIC_LABEL = "Hacker News";

function itemFor(spec: TopicFeed, dayIndex: number, index: number, dayIso: string): FeedItemSpec {
  const word = spec.vocabulary[index % spec.vocabulary.length] ?? spec.key;
  const second = spec.vocabulary[(index + 1) % spec.vocabulary.length] ?? "";
  return {
    guid: `${spec.key}:d${dayIndex}:${index}`,
    title: `${word}：第 ${dayIndex} 天的第 ${index} 篇`,
    summary: `${word}与${second}。${word}的做法、${word}的坑、${second}的取舍，都在这一篇里讲清楚。`,
    link: `https://${spec.key}.example/posts/${dayIndex}-${index}`,
    pubDate: spec.dated ? dayIso : null,
    coverUrl:
      spec.hasCovers && index % 3 !== 0 ? `https://${spec.key}.example/cover-${index}.jpg` : null,
    author: index % 2 === 0 ? `${spec.key} 编辑部` : null,
  };
}

function renderFeed(spec: TopicFeed, items: readonly FeedItemSpec[]): string {
  if (spec.format === "atom") return buildAtomFeed(spec.key, items);
  if (spec.format === "json") return buildJsonFeed(spec.key, items);
  return buildRssFeed(spec.key, items);
}

export interface SyntheticWorld {
  /** Publishes one simulated day's items on every feed and re-registers the routes. Feeds keep a
   * backlog, exactly like real ones: yesterday's entries are still in today's document. */
  publishDay(dayIndex: number, dayIso: string): void;
  /** How many items the world has published under one topic label so far. */
  publishedCount(topicLabel: string): number;
  readonly network: FakeChannelNetwork;
}

/** How many days of backlog a feed keeps in its document. */
const BACKLOG_DAYS = 3;

export function createSyntheticWorld(
  network: FakeChannelNetwork,
  feeds: readonly TopicFeed[] = JOURNEY_FEEDS,
): SyntheticWorld {
  const backlog = new Map<string, FeedItemSpec[]>();
  const published = new Map<string, number>();

  return {
    network,
    publishedCount(topicLabel) {
      return published.get(topicLabel) ?? 0;
    },
    publishDay(dayIndex, dayIso) {
      for (const spec of feeds) {
        const fresh = Array.from({ length: spec.itemsPerDay }, (_unused, index) =>
          itemFor(spec, dayIndex, index, dayIso),
        );
        const kept = [...fresh, ...(backlog.get(spec.feedUrl) ?? [])].slice(
          0,
          spec.itemsPerDay * BACKLOG_DAYS,
        );
        backlog.set(spec.feedUrl, kept);
        published.set(spec.topicLabel, (published.get(spec.topicLabel) ?? 0) + fresh.length);
        network.route(spec.feedUrl, {
          body: renderFeed(spec, kept),
          contentType:
            spec.format === "json" ? "application/feed+json" : "application/xml; charset=utf-8",
          // A validator that changes with the day: a second poll on the same day is a real 304.
          etag: `"${spec.key}-${dayIndex}"`,
        });
      }

      network.route(HACKER_NEWS_POLL_URL, {
        body: buildAlgoliaResponse(
          Array.from({ length: 5 }, (_unused, index) => ({
            guid: `hn-front-${dayIndex}-${index}`,
            title: `Hacker News 头版 ${dayIndex}-${index}`,
            summary: "front page discussion thread about infrastructure and tooling",
            link: `https://news.example/story/${dayIndex}-${index}`,
            pubDate: dayIso,
          })),
        ),
        contentType: "application/json",
        etag: `"hn-front-${dayIndex}"`,
      });

      // Active recall: the query term comes back inside the items, so a recalled card is
      // genuinely about the term the reader's own history produced.
      network.routePrefix(HACKER_NEWS_SEARCH_PREFIX, (url) => {
        const query = new URL(url).searchParams.get("query") ?? "unknown";
        return {
          body: buildAlgoliaResponse(
            Array.from({ length: 4 }, (_unused, index) => ({
              guid: `hn-search-${query}-${dayIndex}-${index}`,
              title: `${query} 相关讨论 ${dayIndex}-${index}`,
              summary: `${query}：这条讨论围绕${query}展开，回帖里提到了${query}的几种做法。`,
              link: `https://news.example/search/${encodeURIComponent(query)}/${dayIndex}-${index}`,
              pubDate: dayIso,
            })),
          ),
          contentType: "application/json",
        };
      });
    },
  };
}
