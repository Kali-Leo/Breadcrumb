/**
 * Purpose: real-database tests for the discovery pool's housekeeping (spec 053 §3) — the unseen
 * read leaves opened cards behind, expiry drops only untouched candidates, the cap keeps the
 * newest publications, and the event stream orders rows written in the same millisecond by the
 * order they were written in.
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

function pooledCard(id: string, landedAt: string, publishedAt: string | null = null) {
  return {
    id,
    title: `title ${id}`,
    hook: `hook ${id}`,
    topic_label: "操作系统",
    source: "explore" as const,
    body_md: null,
    embedding_json: null,
    batch_id: "batch-1",
    created_at: landedAt,
    opened_at: null,
    source_id: "hacker-news",
    kind: "article" as const,
    url: `https://example.org/${id}`,
    cover_url: null,
    author: null,
    published_at: publishedAt,
    saved_at: null,
    quality_score: null,
  };
}

describe("discovery pool maintenance (real sqlite)", () => {
  it(
    "reads only the cards the reader has never opened",
    async () => {
      database = await openMigratedDatabase();
      const repo = createDiscoveryRepo(database.sql);
      await repo.insertCards([
        pooledCard("card-1", "2026-08-17T09:00:00Z"),
        pooledCard("card-2", "2026-08-17T09:00:01Z"),
      ]);
      await repo.markOpened("card-1", "2026-08-17T10:00:00Z");

      expect((await repo.listUnseenPoolCards(10)).map((card) => card.id)).toEqual(["card-2"]);
      // The opened card is still in the library — 收藏 and history reach it through other reads.
      expect((await repo.listNewestCards(10)).map((card) => card.id)).toHaveLength(2);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "expires untouched candidates that landed before the cutoff, and nothing else",
    async () => {
      database = await openMigratedDatabase();
      const repo = createDiscoveryRepo(database.sql);
      await repo.insertCards([
        pooledCard("old-untouched", "2026-07-01T09:00:00Z"),
        pooledCard("old-opened", "2026-07-01T09:00:01Z"),
        pooledCard("old-saved", "2026-07-01T09:00:02Z"),
        pooledCard("fresh", "2026-08-17T09:00:00Z"),
      ]);
      await repo.markOpened("old-opened", "2026-07-02T09:00:00Z");
      await repo.markSaved("old-saved", "2026-07-02T09:00:00Z");

      await repo.deleteUnseenCardsLandedBefore("2026-08-03T00:00:00Z");
      expect((await repo.listNewestCards(10)).map((card) => card.id).sort()).toEqual([
        "fresh",
        "old-opened",
        "old-saved",
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "trims the pool to its cap, dropping the oldest publications first",
    async () => {
      database = await openMigratedDatabase();
      const repo = createDiscoveryRepo(database.sql);
      await repo.insertCards([
        pooledCard("published-first", "2026-08-17T09:00:00Z", "2026-08-10T00:00:00Z"),
        pooledCard("published-second", "2026-08-17T09:00:00Z", "2026-08-12T00:00:00Z"),
        pooledCard("published-third", "2026-08-17T09:00:00Z", "2026-08-14T00:00:00Z"),
        pooledCard("opened-and-oldest", "2026-08-17T09:00:00Z", "2026-08-01T00:00:00Z"),
      ]);
      await repo.markOpened("opened-and-oldest", "2026-08-17T10:00:00Z");

      await repo.trimUnseenPoolTo(2);
      expect((await repo.listNewestCards(10)).map((card) => card.id).sort()).toEqual([
        "opened-and-oldest",
        "published-second",
        "published-third",
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "keeps same-instant events in the order they were written",
    async () => {
      database = await openMigratedDatabase();
      const repo = createDiscoveryRepo(database.sql);
      const sameInstant = "2026-08-17T09:00:00.000Z";
      for (const id of ["zulu", "alpha", "mike"]) {
        await repo.insertEvent({
          id,
          card_id: "",
          topic_label: id,
          kind: "onboarding",
          value_ms: 1,
          created_at: sameInstant,
        });
      }
      expect((await repo.listAllEvents()).map((row) => row.id)).toEqual(["zulu", "alpha", "mike"]);
      expect((await repo.listEventsSince(sameInstant)).map((row) => row.id)).toEqual([
        "zulu",
        "alpha",
        "mike",
      ]);
    },
    TEST_TIMEOUT_MS,
  );
});
