/**
 * Purpose: the feeds nobody wants to receive — seeded-random payloads built to break a reader:
 * unclosed XML, HTML login pages served as a feed, JSON that is not a feed, a single entry the
 * size of a novel, entries whose guid repeats inside one feed and across feeds, dates from the
 * far future and from nowhere, and titles carrying script tags, entities, direction overrides and
 * emoji. Registered into a FakeChannelNetwork exactly like an honest feed would be.
 * Main exports: HOSTILE_FEED_URLS, plantHostileWorld.
 */

import { pickWeighted, randomInt } from "../util/prng";
import type { FakeChannelNetwork } from "./fakeChannelNetwork";
import {
  AWKWARD_DATES,
  buildAtomFeed,
  buildJsonFeed,
  buildRssFeed,
  type FeedItemSpec,
  HOSTILE_TEXTS,
} from "./syntheticFeeds";

export const HOSTILE_FEED_URLS: readonly string[] = [
  "https://broken-one.example/feed.xml",
  "https://broken-two.example/atom.xml",
  "https://broken-three.example/feed.json",
  "https://broken-four.example/rss",
];

/** How a feed's document is damaged. Each one is something a real channel has served. */
type Damage =
  | "none"
  | "unclosed-xml"
  | "html-login-page"
  | "empty-body"
  | "json-but-not-a-feed"
  | "cut-in-half"
  | "one-enormous-entry"
  | "repeated-guids";

const DAMAGE_WEIGHTS: readonly { item: Damage; weight: number }[] = [
  { item: "none", weight: 4 },
  { item: "unclosed-xml", weight: 2 },
  { item: "html-login-page", weight: 2 },
  { item: "empty-body", weight: 1 },
  { item: "json-but-not-a-feed", weight: 1 },
  { item: "cut-in-half", weight: 2 },
  { item: "one-enormous-entry", weight: 1 },
  { item: "repeated-guids", weight: 2 },
];

function pick<Item>(random: () => number, items: readonly Item[]): Item {
  const index = randomInt(random, 0, items.length - 1);
  return items[index] ?? (items[0] as Item);
}

function hostileItem(random: () => number, feedIndex: number, index: number): FeedItemSpec {
  const title = pick(random, HOSTILE_TEXTS);
  const summary = pick(random, HOSTILE_TEXTS);
  return {
    // A guid shared across feeds on purpose: the pool's identity is source-scoped, and this is
    // what proves it.
    guid: random() < 0.3 ? `shared-guid-${index}` : `feed${feedIndex}-item-${index}`,
    title,
    summary,
    link:
      random() < 0.15
        ? "not a url at all"
        : `https://broken-${feedIndex}.example/posts/${index}?q=${encodeURIComponent(title.slice(0, 20))}`,
    pubDate: pick(random, AWKWARD_DATES),
    coverUrl: random() < 0.4 ? `javascript:alert(${index})` : null,
    author: random() < 0.5 ? pick(random, HOSTILE_TEXTS) : null,
    enclosure:
      random() < 0.2
        ? { url: `https://broken-${feedIndex}.example/a.mp3`, type: "audio/mpeg" }
        : null,
  };
}

function render(feedIndex: number, items: readonly FeedItemSpec[]): string {
  const format = feedIndex % 3;
  if (format === 1) return buildAtomFeed(`hostile-${feedIndex}`, items);
  if (format === 2) return buildJsonFeed(`hostile-${feedIndex}`, items);
  return buildRssFeed(`hostile-${feedIndex}`, items);
}

function damage(document: string, kind: Damage, random: () => number): string {
  switch (kind) {
    case "unclosed-xml":
      return `${document.slice(0, Math.max(40, Math.floor(document.length * 0.6)))}<item><title>`;
    case "html-login-page":
      return "<!doctype html><html><head><title>登录</title></head><body>请先登录</body></html>";
    case "empty-body":
      return "";
    case "json-but-not-a-feed":
      return JSON.stringify({ error: "forbidden", retryAfter: randomInt(random, 1, 900) });
    case "cut-in-half":
      return document.slice(0, Math.floor(document.length / 2));
    default:
      return document;
  }
}

export interface HostileWorldOptions {
  random: () => number;
  /** How many of the hostile feeds are live this round. */
  feedCount: number;
}

/** Plants one round's worth of hostile feeds and returns which addresses were used. */
export function plantHostileWorld(
  network: FakeChannelNetwork,
  options: HostileWorldOptions,
): string[] {
  const { random } = options;
  const used: string[] = [];
  for (let feedIndex = 0; feedIndex < options.feedCount; feedIndex += 1) {
    const url = HOSTILE_FEED_URLS[feedIndex];
    if (url === undefined) break;
    used.push(url);
    const kind = pickWeighted(random, DAMAGE_WEIGHTS);
    let items = Array.from({ length: randomInt(random, 0, 12) }, (_unused, index) =>
      hostileItem(random, feedIndex, index),
    );
    if (kind === "repeated-guids") {
      items = items.map((item) => ({ ...item, guid: "one-guid-for-everything" }));
    }
    if (kind === "one-enormous-entry") {
      items = [
        {
          ...hostileItem(random, feedIndex, 0),
          summary: "论".repeat(200_000),
          title: `巨大条目 ${"标题".repeat(4_000)}`,
        },
      ];
    }
    const document = damage(render(feedIndex, items), kind, random);
    network.route(url, {
      body: document,
      status: random() < 0.15 ? 500 : 200,
      contentType: feedIndex % 3 === 2 ? "application/feed+json" : "application/xml; charset=utf-8",
    });
  }
  return used;
}
