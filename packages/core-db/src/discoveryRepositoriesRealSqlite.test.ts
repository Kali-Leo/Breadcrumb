/**
 * Purpose: real-database tests for the discovery repository's spec 053 additions — an external
 * card round-trips with every new column, the 收藏 toggle saves and unsaves without dropping
 * the card from the pool, and the unseen-pool count follows opens only.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createDiscoveryRepo } from "./discoveryRepositories";
import { openMigratedDatabase, type RealSqliteDatabase } from "./realSqliteTestFixture";

/** Generous budget: opening a database replays the whole migration list (see 091b787). */
const TEST_TIMEOUT_MS = 30_000;

let database: RealSqliteDatabase | null = null;

afterEach(() => {
  database?.close();
  database = null;
});

function makeExternalCard(id: string, createdAt: string) {
  return {
    id,
    title: `title ${id}`,
    hook: `hook ${id}`,
    topic_label: "操作系统",
    source: "nearby" as const,
    body_md: null,
    embedding_json: null,
    batch_id: "batch-1",
    created_at: createdAt,
    opened_at: null,
    source_id: "hacker-news",
    kind: "article" as const,
    url: `https://example.org/${id}`,
    cover_url: null,
    author: null,
    published_at: createdAt,
    saved_at: null,
    quality_score: null,
  };
}

describe("createDiscoveryRepo external cards (real sqlite)", () => {
  it(
    "round-trips every external-content column",
    async () => {
      database = await openMigratedDatabase();
      const repo = createDiscoveryRepo(database.sql);
      await repo.insertCards([
        {
          id: "card-1",
          title: "Why Unix pipes are elegant",
          hook: "Small programs, one stream.",
          topic_label: "操作系统",
          source: "nearby",
          body_md: null,
          embedding_json: null,
          batch_id: "batch-1",
          created_at: "2026-08-17T09:00:00Z",
          opened_at: null,
          source_id: "hacker-news",
          kind: "discussion",
          url: "https://news.ycombinator.com/item?id=1",
          cover_url: "https://example.org/cover.png",
          author: "pg",
          published_at: "2026-08-16T20:00:00Z",
          saved_at: null,
          quality_score: 0.82,
        },
      ]);

      const [card] = await repo.listNewestCards(10);
      expect(card?.source_id).toBe("hacker-news");
      expect(card?.kind).toBe("discussion");
      expect(card?.url).toBe("https://news.ycombinator.com/item?id=1");
      expect(card?.cover_url).toBe("https://example.org/cover.png");
      expect(card?.author).toBe("pg");
      expect(card?.published_at).toBe("2026-08-16T20:00:00Z");
      expect(card?.quality_score).toBeCloseTo(0.82);
      expect(card?.saved_at).toBeNull();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "lists saved cards newest first and drops one again on unsave",
    async () => {
      database = await openMigratedDatabase();
      const repo = createDiscoveryRepo(database.sql);
      await repo.insertCards([
        makeExternalCard("card-1", "2026-08-17T09:00:00Z"),
        makeExternalCard("card-2", "2026-08-17T09:00:01Z"),
        makeExternalCard("card-3", "2026-08-17T09:00:02Z"),
      ]);

      expect(await repo.listSaved()).toEqual([]);

      await repo.markSaved("card-1", "2026-08-17T10:00:00Z");
      await repo.markSaved("card-3", "2026-08-17T11:00:00Z");
      expect((await repo.listSaved()).map((card) => card.id)).toEqual(["card-3", "card-1"]);

      await repo.markSaved("card-3", null);
      expect((await repo.listSaved()).map((card) => card.id)).toEqual(["card-1"]);
      // Unsaving leaves the card itself in the pool.
      expect((await repo.listNewestCards(10)).map((card) => card.id)).toHaveLength(3);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "counts only cards the user has never opened",
    async () => {
      database = await openMigratedDatabase();
      const repo = createDiscoveryRepo(database.sql);
      await repo.insertCards([
        makeExternalCard("card-1", "2026-08-17T09:00:00Z"),
        makeExternalCard("card-2", "2026-08-17T09:00:01Z"),
      ]);
      expect(await repo.countUnseenPoolCards()).toBe(2);

      await repo.markOpened("card-1", "2026-08-17T10:00:00Z");
      expect(await repo.countUnseenPoolCards()).toBe(1);

      // Saving a card is not opening it — the pool count must not move.
      await repo.markSaved("card-2", "2026-08-17T10:05:00Z");
      expect(await repo.countUnseenPoolCards()).toBe(1);
    },
    TEST_TIMEOUT_MS,
  );
});
