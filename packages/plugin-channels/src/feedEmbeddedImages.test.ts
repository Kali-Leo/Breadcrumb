/**
 * Purpose: unit tests for firstEmbeddedImageUrl and for the cover it gives the generic adapter,
 * against the markup real feeds actually ship — SegmentFault's relative `/img/…` inside an Atom
 * summary, a WordPress post whose first picture is a full-width absolute address, a lazy-loading
 * template that keeps the real address in data-src, and the tracking pixels that ride along.
 */
import { describe, expect, it } from "vitest";
import { firstEmbeddedImageUrl } from "./feedEmbeddedImages";
import { parseFeedIntoCandidateItems } from "./genericFeedAdapter";

const FEED_URL = "https://segmentfault.com/feeds";

describe("firstEmbeddedImageUrl", () => {
  it("takes the first picture an entry embeds, in document order", () => {
    const html =
      '<p>开头一段。</p><p><img src="https://cdn.example.com/first.jpg" alt=""></p>' +
      '<p><img src="https://cdn.example.com/second.jpg"></p>';
    expect(firstEmbeddedImageUrl(FEED_URL, html)).toBe("https://cdn.example.com/first.jpg");
  });

  it("resolves a relative address against the feed it arrived in", () => {
    const html = '<p><img width="712" height="162" src="/img/bVdp2bI" alt="" title=""></p>';
    expect(firstEmbeddedImageUrl(FEED_URL, html)).toBe("https://segmentfault.com/img/bVdp2bI");
  });

  it("follows a scheme-relative address to the feed's own scheme", () => {
    const html = '<img src="//images.example.com/a.jpg">';
    expect(firstEmbeddedImageUrl(FEED_URL, html)).toBe("https://images.example.com/a.jpg");
  });

  it("reads the real address out of a lazy-loading template", () => {
    const html =
      '<img src="/static/placeholder.png" data-src="https://cdn.example.com/real.webp" alt="">';
    expect(firstEmbeddedImageUrl(FEED_URL, html)).toBe("https://cdn.example.com/real.webp");
  });

  it("unwinds a doubly escaped query string", () => {
    const html = '<img src="https://cdn.example.com/a.jpg?w=800&amp;h=400">';
    expect(firstEmbeddedImageUrl(FEED_URL, html)).toBe("https://cdn.example.com/a.jpg?w=800&h=400");
  });

  it("refuses a data URI, which is no address a card can show", () => {
    const html = '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">';
    expect(firstEmbeddedImageUrl(FEED_URL, html)).toBeNull();
  });

  it("walks past a 1x1 counter to the picture behind it", () => {
    const html =
      '<img src="https://stats.example.com/hit.gif" width="1" height="1" border="0">' +
      '<img src="https://cdn.example.com/cover.jpg">';
    expect(firstEmbeddedImageUrl(FEED_URL, html)).toBe("https://cdn.example.com/cover.jpg");
  });

  it("walks past a counter hidden by an inline style instead of an attribute", () => {
    const html =
      "<img src=\"https://stats.example.com/hit.gif\" style='width:1px;height:1px;border:0'>" +
      '<img src="https://cdn.example.com/cover.jpg">';
    expect(firstEmbeddedImageUrl(FEED_URL, html)).toBe("https://cdn.example.com/cover.jpg");
  });

  it("walks past a counter that only its file name gives away", () => {
    const html =
      '<img src="https://feeds.example.com/~r/blog/~4/pixel.gif">' +
      '<img src="https://cdn.example.com/cover.jpg">';
    expect(firstEmbeddedImageUrl(FEED_URL, html)).toBe("https://cdn.example.com/cover.jpg");
  });

  it("says nothing when the entry embeds no picture at all", () => {
    expect(firstEmbeddedImageUrl(FEED_URL, "<p>纯文字摘要，没有配图。</p>")).toBeNull();
    expect(firstEmbeddedImageUrl(FEED_URL, null)).toBeNull();
  });
});

/**
 * The shape SegmentFault publishes: an Atom feed with no enclosure, no media namespace and no
 * iTunes art, whose only picture is a relative address inside the escaped HTML of the summary.
 * Before this harvest existed, every card from it was cover-less.
 */
const segmentFaultAtom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="zh-CN">
  <title type="text">SegmentFault 思否</title>
  <entry>
    <title type="text">pi 插件冲突了吗</title>
    <link rel="alternate" type="text/html" href="https://segmentfault.com/q/1010000048111607" />
    <id>https://segmentfault.com/q/1010000048111607</id>
    <updated>2026-08-17T09:12:00Z</updated>
    <summary type="html">&lt;p&gt;每次都要手动输入继续，它才会继续。&lt;/p&gt;&lt;p&gt;&lt;img width="712" height="162" src="/img/bVdp2bI" alt="" title=""&gt;&lt;/p&gt;</summary>
  </entry>
  <entry>
    <title type="text">官网无法续期了?</title>
    <link rel="alternate" type="text/html" href="https://segmentfault.com/q/1010000048110002" />
    <id>https://segmentfault.com/q/1010000048110002</id>
    <updated>2026-08-17T08:00:00Z</updated>
    <summary type="html">&lt;p&gt;续期按钮点不动，有人遇到过吗。&lt;/p&gt;</summary>
  </entry>
</feed>`;

/** The other common shape: an RSS feed that syndicates the whole post in content:encoded, with
 * the article's own picture at the top and a subscription counter at the bottom. */
const fullTextRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>某人的博客</title>
    <link>https://blog.example.com</link>
    <description>Posts</description>
    <item>
      <title>为什么我们换掉了自己的调度器</title>
      <link>https://blog.example.com/posts/scheduler</link>
      <guid>https://blog.example.com/posts/scheduler</guid>
      <pubDate>Sun, 16 Aug 2026 08:30:00 GMT</pubDate>
      <description>换掉调度器之后，尾延迟降了一个数量级。</description>
      <content:encoded>&lt;p&gt;&lt;img src="https://cdn.example.com/posts/scheduler-hero.png" width="1200" height="630"&gt;&lt;/p&gt;&lt;p&gt;换掉调度器之后，尾延迟降了一个数量级。&lt;/p&gt;&lt;img src="https://feeds.example.com/~r/blog/~4/1x1.gif" height="1" width="1"&gt;</content:encoded>
    </item>
  </channel>
</rss>`;

function parse(feedText: string, baseUrl: string) {
  return parseFeedIntoCandidateItems({
    sourceId: "sample",
    defaultKind: "article",
    feedText,
    baseUrl,
    observedAt: new Date("2026-08-17T12:00:00.000Z"),
  });
}

describe("covers harvested through the generic adapter", () => {
  it("gives a SegmentFault answer the picture in its own summary", () => {
    const result = parse(segmentFaultAtom, FEED_URL);
    expect(result.items[0]?.coverUrl).toBe("https://segmentfault.com/img/bVdp2bI");
    // The one with no picture stays cover-less rather than borrowing its neighbour's.
    expect(result.items[1]?.coverUrl).toBeNull();
  });

  it("keeps the summary plain text even though the cover came out of the same HTML", () => {
    const result = parse(segmentFaultAtom, FEED_URL);
    expect(result.items[0]?.summary).toBe("每次都要手动输入继续，它才会继续。");
  });

  it("takes the article's own hero picture out of content:encoded, not the counter", () => {
    const result = parse(fullTextRss, "https://blog.example.com/feed.xml");
    expect(result.items[0]?.coverUrl).toBe("https://cdn.example.com/posts/scheduler-hero.png");
  });
});
