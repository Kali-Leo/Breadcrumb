/**
 * Purpose: unit tests for the generic feed adapter against small inline samples of the four
 * shapes it must handle — RSS 2.0, Atom, podcast RSS with an enclosure and iTunes art, and JSON
 * Feed — plus the messes real feeds arrive in: HTML in titles, relative links, missing dates,
 * repeated guids, and payloads cut off by the size cap.
 */
import { describe, expect, it } from "vitest";
import { parseFeedIntoCandidateItems } from "./genericFeedAdapter";

const observedAt = new Date("2026-08-17T12:00:00.000Z");

function parse(feedText: string, overrides: { defaultKind?: "article" | "podcast" } = {}) {
  return parseFeedIntoCandidateItems({
    sourceId: "sample",
    defaultKind: overrides.defaultKind ?? "article",
    feedText,
    baseUrl: "https://blog.example.com/feed.xml",
    observedAt,
  });
}

const rssSample = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"
     xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Example Blog</title>
    <link>https://blog.example.com</link>
    <description>Posts</description>
    <item>
      <title>&lt;b&gt;Bold&lt;/b&gt; title &amp;amp; more</title>
      <link>/posts/first</link>
      <description>&lt;p&gt;First paragraph.&lt;/p&gt;&lt;p&gt;Second.&lt;/p&gt;</description>
      <guid isPermaLink="false">post-1</guid>
      <pubDate>Sat, 16 Aug 2026 08:30:00 GMT</pubDate>
      <dc:creator>Wei</dc:creator>
      <media:thumbnail url="https://cdn.example.com/first.jpg" />
    </item>
    <item>
      <title>No date here</title>
      <link>https://blog.example.com/posts/second</link>
      <description>Undated post.</description>
      <guid isPermaLink="false">post-2</guid>
    </item>
  </channel>
</rss>`;

describe("parseFeedIntoCandidateItems on RSS 2.0", () => {
  const result = parse(rssSample);

  it("strips HTML tags and unwinds double-encoded entities in the title", () => {
    expect(result.items[0]?.title).toBe("Bold title & more");
  });

  it("flattens the description to plain text without fusing paragraphs", () => {
    expect(result.items[0]?.summary).toBe("First paragraph. Second.");
  });

  it("resolves a relative link against the feed address", () => {
    expect(result.items[0]?.url).toBe("https://blog.example.com/posts/first");
  });

  it("takes the cover from the media namespace and the author from Dublin Core", () => {
    expect(result.items[0]?.coverUrl).toBe("https://cdn.example.com/first.jpg");
    expect(result.items[0]?.author).toBe("Wei");
  });

  it("converts the RFC 822 date and leaves the crowd signal empty", () => {
    expect(result.items[0]?.publishedAt).toBe("2026-08-16T08:30:00.000Z");
    expect(result.items[0]?.upstreamSignal).toBeNull();
  });

  it("leaves the media address empty on an ordinary article", () => {
    expect(result.items[0]?.mediaUrl).toBeNull();
  });

  it("falls back to the observation time when the item carries no date", () => {
    expect(result.items[1]?.publishedAt).toBe(observedAt.toISOString());
    expect(result.parseError).toBeNull();
  });

  it("builds ids that are stable and namespaced by source", () => {
    expect(result.items.map((item) => item.id)).toEqual(["sample:post-1", "sample:post-2"]);
  });
});

const podcastSample = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Example Podcast</title>
    <link>https://podcast.example.com</link>
    <description>Talk</description>
    <item>
      <title>Episode 12</title>
      <link>https://podcast.example.com/12</link>
      <description>Show notes.</description>
      <guid>https://podcast.example.com/12</guid>
      <pubDate>Fri, 15 Aug 2026 10:00:00 GMT</pubDate>
      <enclosure url="https://media.example.com/12.m4a" length="42000000" type="audio/x-m4a" />
      <itunes:image href="https://media.example.com/12.jpg" />
      <itunes:author>Host Name</itunes:author>
    </item>
  </channel>
</rss>`;

describe("parseFeedIntoCandidateItems on podcast RSS", () => {
  it("classifies an audio enclosure as a podcast and uses the iTunes art", () => {
    const [episode] = parse(podcastSample).items;
    expect(episode?.kind).toBe("podcast");
    expect(episode?.coverUrl).toBe("https://media.example.com/12.jpg");
    expect(episode?.author).toBe("Host Name");
  });

  it("keeps the episode page as the address and the enclosure as the media address", () => {
    const [episode] = parse(podcastSample).items;
    expect(episode?.url).toBe("https://podcast.example.com/12");
    expect(episode?.mediaUrl).toBe("https://media.example.com/12.m4a");
  });

  it("uses the enclosure as the address too when the episode links no page", () => {
    const pageless = podcastSample
      .replace("<link>https://podcast.example.com/12</link>", "")
      .replace(
        "<guid>https://podcast.example.com/12</guid>",
        `<guid isPermaLink="false">episode-12</guid>`,
      );
    const [episode] = parse(pageless).items;
    expect(episode?.url).toBe("https://media.example.com/12.m4a");
    expect(episode?.mediaUrl).toBe("https://media.example.com/12.m4a");
  });
});

const atomSample = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Example</title>
  <id>urn:example:feed</id>
  <updated>2026-08-17T00:00:00Z</updated>
  <entry>
    <id>urn:example:entry:1</id>
    <title type="html">&lt;i&gt;Atom&lt;/i&gt; entry</title>
    <link rel="alternate" type="text/html" href="https://atom.example.com/1" />
    <link rel="enclosure" type="image/png" href="https://atom.example.com/1.png" />
    <summary>An entry summary.</summary>
    <published>2026-08-14T09:00:00Z</published>
    <updated>2026-08-15T09:00:00Z</updated>
    <author><name>Atom Author</name></author>
  </entry>
</feed>`;

describe("parseFeedIntoCandidateItems on Atom", () => {
  it("uses the alternate link, the entry id, and the published date", () => {
    const [entry] = parse(atomSample).items;
    expect(entry?.id).toBe("sample:urn:example:entry:1");
    expect(entry?.url).toBe("https://atom.example.com/1");
    expect(entry?.title).toBe("Atom entry");
    expect(entry?.author).toBe("Atom Author");
    expect(entry?.publishedAt).toBe("2026-08-14T09:00:00.000Z");
    expect(entry?.coverUrl).toBe("https://atom.example.com/1.png");
  });
});

const jsonFeedSample = JSON.stringify({
  version: "https://jsonfeed.org/version/1.1",
  title: "JSON Example",
  items: [
    {
      id: "json-1",
      url: "https://json.example.com/1",
      title: "JSON item",
      content_html: "<p>Body text.</p>",
      image: "https://json.example.com/1.jpg",
      date_published: "2026-08-13T07:00:00Z",
      authors: [{ name: "JSON Author" }],
    },
  ],
});

describe("parseFeedIntoCandidateItems on JSON Feed", () => {
  it("maps id, image and author", () => {
    const [item] = parse(jsonFeedSample).items;
    expect(item?.id).toBe("sample:json-1");
    expect(item?.coverUrl).toBe("https://json.example.com/1.jpg");
    expect(item?.summary).toBe("Body text.");
    expect(item?.author).toBe("JSON Author");
  });
});

describe("parseFeedIntoCandidateItems on damaged input", () => {
  it("reports a parse error instead of throwing when the payload is not a feed", () => {
    const result = parse("this is not a feed at all");
    expect(result.items).toEqual([]);
    expect(result.parseError).not.toBeNull();
  });

  it("salvages the complete entries when the size cap cut the feed in half", () => {
    const secondItemStart = rssSample.indexOf("<item>", rssSample.indexOf("<item>") + 1);
    const truncated = rssSample.slice(0, secondItemStart + 60);
    const result = parse(truncated);
    expect(result.parseError).toBeNull();
    expect(result.repairedFromTruncation).toBe(true);
    expect(result.items.map((item) => item.id)).toEqual(["sample:post-1"]);
  });

  it("gives up cleanly when the cut left no complete entry", () => {
    const result = parse(rssSample.slice(0, rssSample.indexOf("<item>") + 30));
    expect(result.items).toEqual([]);
    expect(result.parseError).not.toBeNull();
  });

  it("drops entries with no usable link and repeated ids", () => {
    const messy = `<?xml version="1.0"?><rss version="2.0"><channel>
      <title>Messy</title><link>https://messy.example.com</link><description>d</description>
      <item><title>No link</title><description>d</description></item>
      <item><title>Dup</title><link>https://messy.example.com/a</link><guid>dup</guid><description>d</description></item>
      <item><title>Dup again</title><link>https://messy.example.com/b</link><guid>dup</guid><description>d</description></item>
    </channel></rss>`;
    const result = parse(messy);
    expect(result.items.map((item) => item.id)).toEqual(["sample:dup"]);
    expect(result.skippedEntryCount).toBe(2);
  });
});
