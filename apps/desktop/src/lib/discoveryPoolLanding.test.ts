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

const { landCandidateItems } = await import("./discoveryPoolLanding");

const NOW = "2026-08-17T10:00:00.000Z";

function item(overrides: Partial<CandidateItem> & { id: string }): CandidateItem {
  return {
    sourceId: "hacker-news-front-page",
    kind: "discussion",
    url: `https://example.org/${overrides.id}`,
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

  it("names an arXiv card after its category, not after arXiv", async () => {
    const [row] = await landCandidateItems(
      [{ items: [item({ id: "arxiv:1", sourceId: "arxiv-cs-lg", kind: "paper" })] }],
      NOW,
    );
    expect(row?.topic_label).toBe("Machine Learning (cs.LG)");
  });

  it("falls back to the channel's id when the catalog does not know the source", async () => {
    const [row] = await landCandidateItems(
      [{ items: [item({ id: "x:1", sourceId: "a-feed-the-reader-pasted" })] }],
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
