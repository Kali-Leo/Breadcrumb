/**
 * Purpose: unit tests for landCandidateItems — a candidate becomes a displayable card with the
 * channel as its topic (the category, for arXiv), long summaries cut to a glance, and the whole
 * pass idempotent: polling the same feed twice inserts a card exactly once.
 */
import type { CandidateItem } from "@breadcrumb/plugin-channels";
import { afterEach, describe, expect, it, vi } from "vitest";

let poolIds: string[] = [];
const insertCardsMock = vi.fn(async (rows: readonly { id: string }[]) => {
  poolIds.push(...rows.map((row) => row.id));
});

vi.mock("./db", () => ({
  getRepos: vi.fn(async () => ({
    discovery: {
      listCardIds: async () => poolIds,
      insertCards: insertCardsMock,
    },
  })),
}));

const { landCandidateItems, PER_SOURCE_LANDING_CAP, shareLandingsAcrossSources } = await import(
  "./discoveryPoolLanding"
);

const NOW = "2026-08-17T10:00:00.000Z";

function item(overrides: Partial<CandidateItem> & { id: string }): CandidateItem {
  return {
    sourceId: "hacker-news-front-page",
    kind: "discussion",
    url: `https://example.org/${overrides.id}`,
    mediaUrl: null,
    title: `title ${overrides.id}`,
    summary: "一段摘要。",
    coverUrl: null,
    author: null,
    publishedAt: "2026-08-17T09:00:00.000Z",
    upstreamSignal: 0.5,
    ...overrides,
  };
}

afterEach(() => {
  poolIds = [];
  insertCardsMock.mockClear();
});

describe("landCandidateItems", () => {
  it("carries every field of the candidate onto the card", async () => {
    const [row] = await landCandidateItems(
      [
        {
          items: [
            item({
              id: "hn:1",
              title: "Why Unix pipes are elegant",
              coverUrl: "https://example.org/cover.png",
              author: "pg",
            }),
          ],
        },
      ],
      NOW,
    );
    expect(row).toMatchObject({
      id: "hn:1",
      title: "Why Unix pipes are elegant",
      topic_label: "Hacker News",
      source_id: "hacker-news-front-page",
      kind: "discussion",
      url: "https://example.org/hn:1",
      cover_url: "https://example.org/cover.png",
      author: "pg",
      published_at: "2026-08-17T09:00:00.000Z",
      upstream_signal: 0.5,
      created_at: NOW,
    });
    // Nothing on the display path waits on these two.
    expect(row?.embedding_json).toBeNull();
    expect(row?.quality_score).toBeNull();
  });

  it("carries a podcast episode's audio address, so the player has a file to load", async () => {
    const [row] = await landCandidateItems(
      [
        {
          items: [
            item({
              id: "podcast:1",
              kind: "podcast",
              url: "https://podcast.example.com/12",
              mediaUrl: "https://media.example.com/12.m4a",
            }),
          ],
        },
      ],
      NOW,
    );
    expect(row?.url).toBe("https://podcast.example.com/12");
    expect(row?.media_url).toBe("https://media.example.com/12.m4a");
  });

  it("names an arXiv card after its category, not after arXiv", async () => {
    const [row] = await landCandidateItems(
      [{ items: [item({ id: "arxiv:1", sourceId: "arxiv-cs-lg", kind: "paper" })] }],
      NOW,
    );
    expect(row?.topic_label).toBe("Machine Learning (cs.LG)");
  });

  /**
   * The old expectation here — the raw source id as the topic — was the bug's shadow (spec 053 T9
   * finding #1): a self-added source's id is `user-feed:<the whole address>`, and that string went
   * on to be shown as a topic and sent to Hacker News as a search term. A pasted feed is filed
   * under the hostname the settings page already lists it as.
   */
  it("files a self-added feed under its hostname, never under its address", async () => {
    const [row] = await landCandidateItems(
      [
        {
          items: [item({ id: "x:1", sourceId: "user-feed:https://www.blog.example/rss/feed.xml" })],
        },
      ],
      NOW,
    );
    expect(row?.topic_label).toBe("blog.example");
  });

  it("keeps an id that is not an address readable as it is", async () => {
    const [row] = await landCandidateItems(
      [{ items: [item({ id: "x:2", sourceId: "a-feed-the-reader-pasted" })] }],
      NOW,
    );
    expect(row?.topic_label).toBe("a-feed-the-reader-pasted");
  });

  it("cuts a whole-article summary down to a glance", async () => {
    const [row] = await landCandidateItems(
      [{ items: [item({ id: "long:1", summary: "很长的正文。".repeat(60) })] }],
      NOW,
    );
    expect(row?.hook.length).toBeLessThanOrEqual(121);
    expect(row?.hook.endsWith("…")).toBe(true);
  });

  it("keeps a short summary exactly as the source wrote it", async () => {
    const [row] = await landCandidateItems(
      [{ items: [item({ id: "short:1", summary: "  一句话  摘要。 " })] }],
      NOW,
    );
    expect(row?.hook).toBe("一句话 摘要。");
  });

  it("inserts nothing the second time the same feed is polled", async () => {
    const items = [item({ id: "hn:1" }), item({ id: "hn:2" })];
    const first = await landCandidateItems([{ items }], NOW);
    const second = await landCandidateItems([{ items }], NOW);
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(0);
    expect(insertCardsMock).toHaveBeenCalledTimes(1);
  });

  it("collapses an id repeated inside one round", async () => {
    const landed = await landCandidateItems(
      [{ items: [item({ id: "hn:1" })] }, { items: [item({ id: "hn:1" })], topicLabel: "编译器" }],
      NOW,
    );
    expect(landed.map((row) => row.id)).toEqual(["hn:1"]);
  });

  it("gives a recalled item the term that found it as its topic", async () => {
    const [row] = await landCandidateItems(
      [{ items: [item({ id: "hn:9" })], topicLabel: "编译器", source: "nearby" }],
      NOW,
    );
    expect(row?.topic_label).toBe("编译器");
    expect(row?.source).toBe("nearby");
  });

  it("does not touch the database when a round found nothing", async () => {
    expect(await landCandidateItems([{ items: [] }], NOW)).toEqual([]);
    expect(insertCardsMock).not.toHaveBeenCalled();
  });
});

/**
 * FIXED (2026-08-17, spec 053 T10). Two arXiv categories publishing a couple of hundred abstracts
 * each filled the 500-card pool between them in a single round; the pruning that runs afterwards
 * trims by oldest publication, so what the small channels had landed went first and a walkthrough
 * found reachable sources — 新浪科技, arXiv q-bio.NC — sitting at zero cards in a pool at its cap.
 */
describe("sharing one round's landings across the sources that answered", () => {
  const manyFrom = (sourceId: string, count: number) =>
    Array.from({ length: count }, (_unused, index) =>
      item({ id: `${sourceId}:${index}`, sourceId }),
    );

  it("keeps at most the cap from any one source", () => {
    const shared = shareLandingsAcrossSources(
      [...manyFrom("arxiv-cs-lg", 200), ...manyFrom("sina-tech", 12)],
      PER_SOURCE_LANDING_CAP,
    );
    const perSource = new Map<string, number>();
    for (const one of shared) {
      perSource.set(one.sourceId, (perSource.get(one.sourceId) ?? 0) + 1);
    }
    expect(perSource.get("arxiv-cs-lg")).toBe(PER_SOURCE_LANDING_CAP);
    expect(perSource.get("sina-tech")).toBe(12);
  });

  it("keeps the newest of what a source sent, in the order the channel published it", () => {
    const shared = shareLandingsAcrossSources(manyFrom("arxiv-cs-lg", 200), 3);
    expect(shared.map((one) => one.id)).toEqual([
      "arxiv-cs-lg:0",
      "arxiv-cs-lg:1",
      "arxiv-cs-lg:2",
    ]);
  });

  it("interleaves the sources rather than running one feed to exhaustion first", () => {
    const shared = shareLandingsAcrossSources(
      [...manyFrom("arxiv-cs-lg", 3), ...manyFrom("sina-tech", 2)],
      PER_SOURCE_LANDING_CAP,
    );
    expect(shared.map((one) => one.id)).toEqual([
      "arxiv-cs-lg:0",
      "sina-tech:0",
      "arxiv-cs-lg:1",
      "sina-tech:1",
      "arxiv-cs-lg:2",
    ]);
  });

  it("lands the small channel's cards even when a giant one answered in the same round", async () => {
    const landed = await landCandidateItems(
      [{ items: [...manyFrom("arxiv-cs-lg", 400), ...manyFrom("sina-tech", 8)] }],
      NOW,
    );
    const fromSina = landed.filter((row) => row.source_id === "sina-tech");
    expect(fromSina).toHaveLength(8);
    expect(landed.filter((row) => row.source_id === "arxiv-cs-lg")).toHaveLength(
      PER_SOURCE_LANDING_CAP,
    );
  });
});
