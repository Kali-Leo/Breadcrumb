/**
 * Purpose: real-database tests for spec 053's migrations on discovery_cards — 0041 applies on a
 * fresh database and on one frozen at 0039 with cards already in it (old rows stay readable,
 * every new column null), discovery_events keeps accepting new kinds because its kind column
 * has no CHECK, and 0043 adds the podcast audio address the same additive way.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createDiscoveryRepo } from "./discoveryRepositories";
import { MIGRATIONS, runMigrations } from "./migrations";
import {
  openDatabaseMigratedThrough,
  openMigratedDatabase,
  type RealSqliteDatabase,
} from "./realSqliteTestFixture";

/** Generous budget: each test replays the whole migration list, which is far slower on a
 * loaded CI runner than vitest's 5s default (same precedent as commit 091b787). */
const TEST_TIMEOUT_MS = 30_000;

let database: RealSqliteDatabase | null = null;

afterEach(() => {
  database?.close();
  database = null;
});

describe("migration 0041 (real sqlite)", () => {
  it(
    "applies every migration on a fresh database and creates channel_state",
    async () => {
      database = await openMigratedDatabase();
      const applied = await database.sql.select<{ id: string }>(
        "SELECT id FROM _migrations ORDER BY id",
      );
      expect(applied.map((row) => row.id)).toEqual(MIGRATIONS.map((migration) => migration.id));

      const cardColumns = await database.sql.select<{ name: string }>(
        "PRAGMA table_info(discovery_cards)",
      );
      expect(cardColumns.map((column) => column.name)).toEqual([
        "id",
        "title",
        "hook",
        "topic_label",
        "source",
        "body_md",
        "embedding_json",
        "batch_id",
        "created_at",
        "opened_at",
        "source_id",
        "kind",
        "url",
        "cover_url",
        "author",
        "published_at",
        "saved_at",
        "quality_score",
        "upstream_signal",
        "media_url",
      ]);

      const channelColumns = await database.sql.select<{ name: string }>(
        "PRAGMA table_info(channel_state)",
      );
      expect(channelColumns.map((column) => column.name)).toEqual([
        "source_id",
        "etag",
        "last_modified",
        "last_fetch_at",
        "reachable",
        "failure_count",
        "daily_budget_used",
        "budget_day",
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "leaves a card written before 0041 readable, with every new column null",
    async () => {
      database = await openDatabaseMigratedThrough("0039_discovery_clear_unopened_stubs");
      await database.sql.execute(
        `INSERT INTO discovery_cards
           (id, title, hook, topic_label, source, body_md, embedding_json, batch_id, created_at, opened_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          "old-card",
          "闭包是什么",
          "函数记住了它出生时的作用域。",
          "编程语言",
          "starter",
          "# 正文",
          null,
          "batch-old",
          "2026-08-16T10:00:00Z",
          "2026-08-16T11:00:00Z",
        ],
      );

      await runMigrations(database.sql);

      const [card] = await createDiscoveryRepo(database.sql).listNewestCards(10);
      expect(card?.id).toBe("old-card");
      expect(card?.title).toBe("闭包是什么");
      expect(card?.body_md).toBe("# 正文");
      expect(card?.opened_at).toBe("2026-08-16T11:00:00Z");
      expect(card?.source_id).toBeNull();
      expect(card?.kind).toBeNull();
      expect(card?.url).toBeNull();
      expect(card?.cover_url).toBeNull();
      expect(card?.author).toBeNull();
      expect(card?.published_at).toBeNull();
      expect(card?.saved_at).toBeNull();
      expect(card?.quality_score).toBeNull();
      expect(card?.media_url).toBeNull();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "accepts the new event kinds, since discovery_events.kind carries no CHECK constraint",
    async () => {
      database = await openMigratedDatabase();
      const repo = createDiscoveryRepo(database.sql);
      for (const kind of ["save", "unsave", "finish", "dial", "onboarding"] as const) {
        await repo.insertEvent({
          id: `event-${kind}`,
          card_id: "card-1",
          topic_label: "编程语言",
          kind,
          value_ms: kind === "dial" ? 70 : null,
          created_at: `2026-08-17T09:00:0${kind.length % 10}Z`,
        });
      }
      const events = await repo.listAllEvents();
      expect(events.map((event) => event.kind).sort()).toEqual([
        "dial",
        "finish",
        "onboarding",
        "save",
        "unsave",
      ]);
      expect(events.find((event) => event.kind === "dial")?.value_ms).toBe(70);
    },
    TEST_TIMEOUT_MS,
  );
});

describe("migration 0043 (real sqlite)", () => {
  it(
    "stores a podcast episode's audio address beside its page address",
    async () => {
      database = await openMigratedDatabase();
      const repo = createDiscoveryRepo(database.sql);
      await repo.insertCards([
        {
          id: "episode-1",
          title: "El Niño 与气候",
          hook: "一集播客。",
          topic_label: "气候",
          source: "explore",
          body_md: null,
          embedding_json: null,
          batch_id: "batch-1",
          created_at: "2026-08-17T09:00:00Z",
          opened_at: null,
          source_id: "podcast-search",
          kind: "podcast",
          url: "https://podcasts.apple.com/us/podcast/super-el-ninos/id1234",
          media_url: "https://open.live.bbc.co.uk/mediaselector/audio.mp3",
        },
      ]);

      const [card] = await repo.listNewestCards(10);
      expect(card?.url).toBe("https://podcasts.apple.com/us/podcast/super-el-ninos/id1234");
      expect(card?.media_url).toBe("https://open.live.bbc.co.uk/mediaselector/audio.mp3");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "leaves a card written before 0043 readable, with no audio address",
    async () => {
      database = await openDatabaseMigratedThrough("0042_discovery_upstream_signal");
      await database.sql.execute(
        `INSERT INTO discovery_cards
           (id, title, hook, topic_label, source, body_md, embedding_json, batch_id, created_at,
            opened_at, source_id, kind, url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          "episode-old",
          "旧的一集",
          "在 0043 之前入库。",
          "气候",
          "explore",
          null,
          null,
          "batch-old",
          "2026-08-16T10:00:00Z",
          null,
          "podcast-search",
          "podcast",
          "https://podcast.example.com/12",
        ],
      );

      await runMigrations(database.sql);

      const [card] = await createDiscoveryRepo(database.sql).listNewestCards(10);
      expect(card?.id).toBe("episode-old");
      expect(card?.url).toBe("https://podcast.example.com/12");
      expect(card?.media_url).toBeNull();
    },
    TEST_TIMEOUT_MS,
  );
});
