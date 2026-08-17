/**
 * Purpose: tests for the arXiv adapter against a category RSS item and a query-API Atom entry
 * shaped like the live ones — that the abstract survives the machine preamble arXiv puts in front
 * of it, that everything comes out as a paper, that the query is built the way the API documents,
 * and that both paths go through the pacer that keeps arXiv's one-request-per-three-seconds rule.
 */
import { describe, expect, it } from "vitest";
import {
  arxivMinimumIntervalMilliseconds,
  buildArxivSearchUrl,
  fetchArxivSource,
  searchArxiv,
} from "./arxivAdapter";
import { RequestPacer } from "./requestPacer";
import { fakeChannelSource, fakeFetchContext } from "./testDoubles";

const observedAt = new Date("2026-08-17T12:00:00.000Z");

/** Records what it was asked to wait for instead of waiting. */
function instantPacer(): { pacer: RequestPacer; sleeps: number[] } {
  const sleeps: number[] = [];
  let clock = 0;
  const pacer = new RequestPacer({
    minimumIntervalMilliseconds: arxivMinimumIntervalMilliseconds,
    now: () => clock,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      clock += milliseconds;
    },
  });
  return { pacer, sleeps };
}

const categoryRss = `<?xml version='1.0' encoding='UTF-8'?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/" version="2.0">
  <channel>
    <title>q-bio.NC updates on arXiv.org</title>
    <link>http://rss.arxiv.org/rss/q-bio.NC</link>
    <description>q-bio.NC updates on the arXiv.org e-print archive.</description>
    <item>
      <title>Data-driven techniques for translational neuroscience</title>
      <link>https://arxiv.org/abs/2608.13749</link>
      <description>arXiv:2608.13749v1 Announce Type: new
Abstract: A review of four methodological pillars.</description>
      <guid isPermaLink="false">oai:arXiv.org:2608.13749v1</guid>
      <pubDate>Mon, 17 Aug 2026 00:00:00 -0400</pubDate>
      <dc:creator>Chen, Wei</dc:creator>
    </item>
    <item>
      <title>An older-style entry (arXiv:2608.00001v1 [q-bio.NC])</title>
      <link>https://arxiv.org/abs/2608.00001</link>
      <description>arXiv:2608.00001v1 Abstract: The identifier used to sit in the title.</description>
      <guid isPermaLink="false">oai:arXiv.org:2608.00001v1</guid>
      <pubDate>Mon, 17 Aug 2026 00:00:00 -0400</pubDate>
    </item>
  </channel>
</rss>`;

const searchAtom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>ArXiv Query: search_query=all:"spaced repetition"</title>
  <entry>
    <id>http://arxiv.org/abs/2607.09876v1</id>
    <updated>2026-07-30T10:00:00Z</updated>
    <published>2026-07-29T10:00:00Z</published>
    <title>Spacing effects in machine learners</title>
    <summary>  We revisit the spacing effect.
  </summary>
    <author><name>Lin Hui</name></author>
    <link href="http://arxiv.org/abs/2607.09876v1" rel="alternate" type="text/html"/>
    <link title="pdf" href="http://arxiv.org/pdf/2607.09876v1" rel="related" type="application/pdf"/>
  </entry>
</feed>`;

const source = fakeChannelSource({
  id: "arxiv-q-bio-nc",
  adapterType: "arxiv",
  endpoint: { feedUrl: "https://rss.arxiv.org/rss/q-bio.NC" },
  defaultKind: "paper",
});

describe("fetchArxivSource", () => {
  it("keeps the abstract and drops the machine preamble in front of it", async () => {
    const { context } = fakeFetchContext({ "https://rss.arxiv.org/rss/q-bio.NC": categoryRss });
    const { pacer } = instantPacer();
    const result = await fetchArxivSource(source, context, { pacer, observedAt });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.summary).toBe("A review of four methodological pillars.");
    expect(result.items[0]?.kind).toBe("paper");
    expect(result.items[0]?.author).toBe("Chen, Wei");
    expect(result.items[0]?.url).toBe("https://arxiv.org/abs/2608.13749");
  });

  it("takes the identifier back out of an older-style title", async () => {
    const { context } = fakeFetchContext({ "https://rss.arxiv.org/rss/q-bio.NC": categoryRss });
    const { pacer } = instantPacer();
    const result = await fetchArxivSource(source, context, { pacer, observedAt });
    expect(result.items[1]?.title).toBe("An older-style entry");
    expect(result.items[1]?.summary).toBe("The identifier used to sit in the title.");
  });

  it("waits out the three-second rule between two requests", async () => {
    const { context } = fakeFetchContext({ "https://rss.arxiv.org/rss/q-bio.NC": categoryRss });
    const { pacer, sleeps } = instantPacer();
    await fetchArxivSource(source, context, { pacer, observedAt });
    await fetchArxivSource(source, context, { pacer, observedAt });
    expect(sleeps).toEqual([arxivMinimumIntervalMilliseconds]);
  });
});

describe("searchArxiv", () => {
  it("builds the documented newest-first query", () => {
    expect(buildArxivSearchUrl("spaced repetition", { maximumResults: 5 })).toBe(
      "https://export.arxiv.org/api/query?search_query=all%3A%22spaced+repetition%22&start=0&max_results=5&sortBy=submittedDate&sortOrder=descending",
    );
  });

  it("reads the query API's Atom, whose summary is the abstract", async () => {
    const searchUrl = buildArxivSearchUrl("spaced repetition");
    const { context, requests } = fakeFetchContext({ [searchUrl]: searchAtom });
    const { pacer } = instantPacer();
    const items = await searchArxiv("spaced repetition", source, context, { pacer, observedAt });

    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe("paper");
    expect(items[0]?.title).toBe("Spacing effects in machine learners");
    expect(items[0]?.summary).toBe("We revisit the spacing effect.");
    expect(items[0]?.url).toBe("http://arxiv.org/abs/2607.09876v1");
    expect(requests[0]?.kind).toBe("follow-up");
  });

  it("returns nothing for a blank query and nothing when arXiv is unreachable", async () => {
    const { context } = fakeFetchContext({});
    const { pacer } = instantPacer();
    expect(await searchArxiv("  ", source, context, { pacer })).toEqual([]);
    expect(await searchArxiv("anything", source, context, { pacer })).toEqual([]);
  });
});
