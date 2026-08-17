/**
 * Purpose: real-database tests for createChannelStateRepo (spec 053 §2) — a channel with no
 * state yet, the upsert that records a fetch attempt, the unreachable case with its failure
 * streak, and the daily-budget rollover that spares channels already on today.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createChannelStateRepo } from "./channelStateRepositories";
import type { ChannelStateRow } from "./channelTypes";
import { openMigratedDatabase, type RealSqliteDatabase } from "./realSqliteTestFixture";

/** Generous budget: opening a database replays the whole migration list (see 091b787). */
const TEST_TIMEOUT_MS = 30_000;

let database: RealSqliteDatabase | null = null;

afterEach(() => {
  database?.close();
  database = null;
});

function makeChannelState(overrides: Partial<ChannelStateRow> = {}): ChannelStateRow {
  return {
    source_id: "hacker-news",
    etag: '"abc123"',
    last_modified: "Sun, 17 Aug 2026 09:00:00 GMT",
    last_fetch_at: "2026-08-17T09:00:00Z",
    reachable: 1,
    failure_count: 0,
    daily_budget_used: 3,
    budget_day: "2026-08-17",
    ...overrides,
  };
}

describe("createChannelStateRepo (real sqlite)", () => {
  it(
    "returns null for a channel never fetched, then upserts and re-upserts it",
    async () => {
      database = await openMigratedDatabase();
      const repo = createChannelStateRepo(database.sql);
      expect(await repo.get("hacker-news")).toBeNull();

      await repo.upsert(makeChannelState());
      expect(await repo.get("hacker-news")).toEqual(makeChannelState());

      // A 304 response: the validators stay, the fetch instant and budget advance.
      await repo.upsert(
        makeChannelState({ last_fetch_at: "2026-08-17T10:00:00Z", daily_budget_used: 4 }),
      );
      const state = await repo.get("hacker-news");
      expect(state?.last_fetch_at).toBe("2026-08-17T10:00:00Z");
      expect(state?.daily_budget_used).toBe(4);
      expect(state?.etag).toBe('"abc123"');
      expect(await repo.listAll()).toHaveLength(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "records an unreachable channel with its failure streak",
    async () => {
      database = await openMigratedDatabase();
      const repo = createChannelStateRepo(database.sql);
      await repo.upsert(
        makeChannelState({ source_id: "v2ex", reachable: 0, failure_count: 3, etag: null }),
      );
      const state = await repo.get("v2ex");
      expect(state?.reachable).toBe(0);
      expect(state?.failure_count).toBe(3);
      expect(state?.etag).toBeNull();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "resets the daily budget of channels left on an earlier day only",
    async () => {
      database = await openMigratedDatabase();
      const repo = createChannelStateRepo(database.sql);
      await repo.upsert(makeChannelState({ source_id: "yesterday", budget_day: "2026-08-16" }));
      await repo.upsert(makeChannelState({ source_id: "today", budget_day: "2026-08-17" }));
      await repo.upsert(makeChannelState({ source_id: "never", budget_day: null }));

      await repo.resetDailyBudget("2026-08-17");

      expect((await repo.get("yesterday"))?.daily_budget_used).toBe(0);
      expect((await repo.get("yesterday"))?.budget_day).toBe("2026-08-17");
      expect((await repo.get("today"))?.daily_budget_used).toBe(3);
      expect((await repo.get("never"))?.daily_budget_used).toBe(0);
    },
    TEST_TIMEOUT_MS,
  );
});
