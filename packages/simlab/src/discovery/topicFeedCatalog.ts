/**
 * Purpose: the feeds a journey's reader subscribes to — topically distinct, and deliberately
 * unalike in every dimension the pipeline has to survive: RSS against Atom against JSON Feed,
 * covers against no covers, dated against undated, a handful of items a day against an archive
 * republished whole. Pure data; the world builder next door turns these into payloads.
 * Main exports: TopicFeed, TOPIC_FEEDS, JOURNEY_FEEDS, topicFeedByKey.
 */

export interface TopicFeed {
  /** Short handle used in this harness's own bookkeeping and in the item text. */
  key: string;
  /** The address the reader pastes into 设置. */
  feedUrl: string;
  /** The label the pipeline actually files these cards under. Reader-added feeds are not in the
   * shipped catalog, so discoveryPoolLanding falls back to the source id — see the long-journey
   * suite's note on what that id turns into downstream. */
  topicLabel: string;
  format: "rss" | "atom" | "json";
  /** Distinctive vocabulary — what makes items from this feed cluster together once embedded. */
  vocabulary: readonly string[];
  itemsPerDay: number;
  hasCovers: boolean;
  /** Undated feeds exist and the adapter is supposed to date them at observation time. */
  dated: boolean;
}

function feed(spec: Omit<TopicFeed, "topicLabel">): TopicFeed {
  return { ...spec, topicLabel: `user-feed:${spec.feedUrl}` };
}

export const TOPIC_FEEDS: readonly TopicFeed[] = [
  feed({
    key: "compilers",
    feedUrl: "https://compilers.example/feed.xml",
    format: "rss",
    vocabulary: ["编译器优化", "寄存器分配", "中间表示", "类型推导", "垃圾回收"],
    itemsPerDay: 3,
    hasCovers: true,
    dated: true,
  }),
  feed({
    key: "gardening",
    feedUrl: "https://gardening.example/atom.xml",
    format: "atom",
    vocabulary: ["堆肥发酵", "月季扦插", "土壤酸碱", "阳台种菜", "越冬修剪"],
    itemsPerDay: 2,
    hasCovers: true,
    dated: true,
  }),
  feed({
    key: "neuro",
    feedUrl: "https://neuro.example/feed.json",
    format: "json",
    vocabulary: ["海马体", "突触可塑", "睡眠纺锤", "记忆巩固", "多巴胺"],
    itemsPerDay: 3,
    hasCovers: false,
    dated: true,
  }),
  feed({
    key: "gossip",
    feedUrl: "https://celebritygossip.example/feed.xml",
    format: "rss",
    vocabulary: ["明星八卦", "综艺撕番", "热搜通稿", "机场街拍", "恋情实锤"],
    itemsPerDay: 3,
    hasCovers: true,
    dated: true,
  }),
  feed({
    key: "citynews",
    feedUrl: "https://citynews.example/feed.xml",
    format: "rss",
    vocabulary: ["市政通告", "地铁延误", "天气预警", "菜价小幅", "道路施工"],
    itemsPerDay: 3,
    hasCovers: false,
    dated: false,
  }),
  feed({
    key: "megafeed",
    feedUrl: "https://megafeed.example/feed.xml",
    format: "rss",
    // A feed that republishes a large archive on every poll — the shape the channel survey
    // measured at 18.5 MB. Three days of backlog puts ~360 entries through the parser a day.
    vocabulary: ["聚合转载", "站点归档", "每日快照", "全网抓取"],
    itemsPerDay: 120,
    hasCovers: false,
    dated: true,
  }),
];

/** The feeds an ordinary journey subscribes to: everything but the archive republisher, which
 * is big enough on its own to swamp a pool and is opted into by the test that wants that. */
export const JOURNEY_FEEDS: readonly TopicFeed[] = TOPIC_FEEDS.filter(
  (entry) => entry.key !== "megafeed",
);

export function topicFeedByKey(key: string): TopicFeed {
  const found = TOPIC_FEEDS.find((entry) => entry.key === key);
  if (found === undefined) throw new Error(`no synthetic feed named ${key}`);
  return found;
}
