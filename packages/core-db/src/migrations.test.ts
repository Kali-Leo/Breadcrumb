/**
 * Purpose: unit tests for exactly-once migration tracking using a fake SqlClient.
 */
import { describe, expect, it, vi } from "vitest";
import { MIGRATIONS, RETIRED_MIGRATION_IDS, runMigrations } from "./migrations";
import { withSequentialTransactions } from "./transactionFallback";
import type { SqlClient } from "./types";

/** In-memory fake: records executed statements and simulates the _migrations table. */
function makeFakeSql() {
  const executed: string[] = [];
  const appliedIds: string[] = [];
  const client: SqlClient = withSequentialTransactions({
    select: <Row>(sql: string) => {
      if (sql.includes("FROM _migrations")) {
        return Promise.resolve(appliedIds.map((id) => ({ id })) as Row[]);
      }
      return Promise.resolve([] as Row[]);
    },
    execute: (sql: string, params?: readonly unknown[]) => {
      executed.push(sql);
      if (sql.startsWith("INSERT INTO _migrations")) {
        appliedIds.push(String(params?.[0]));
      }
      if (sql.includes("SET id = '0006_factcheck'") && !appliedIds.includes("0006_factcheck")) {
        const legacyIndex = appliedIds.indexOf("0005_factcheck");
        if (legacyIndex !== -1) appliedIds[legacyIndex] = "0006_factcheck";
      }
      return Promise.resolve();
    },
  });
  return { client, executed, appliedIds };
}

describe("runMigrations", () => {
  it("applies every migration on a fresh database and records each id", async () => {
    const { client, appliedIds } = makeFakeSql();
    await runMigrations(client);
    expect(appliedIds).toEqual(MIGRATIONS.map((migration) => migration.id));
  });

  it("applies nothing on a second run", async () => {
    const { client, executed } = makeFakeSql();
    await runMigrations(client);
    const countAfterFirstRun = executed.length;
    await runMigrations(client);
    // Second run only re-issues the tracking-table create and the legacy-id repair;
    // no migration statements re-run.
    expect(executed.length).toBe(countAfterFirstRun + 2);
  });

  it("repairs the legacy 0005_factcheck id instead of re-running the migration", async () => {
    const { client, appliedIds, executed } = makeFakeSql();
    // A database migrated when factcheck still shipped as 0005 (before its renumbering).
    appliedIds.push(...MIGRATIONS.slice(0, 5).map((migration) => migration.id));
    appliedIds.push("0005_factcheck");
    await runMigrations(client);
    expect(appliedIds).toEqual(MIGRATIONS.map((migration) => migration.id));
    const factcheck = MIGRATIONS.find((migration) => migration.id === "0006_factcheck");
    const reran = executed.filter((sql) => factcheck?.statements.includes(sql));
    expect(reran).toHaveLength(0);
  });

  it("applies only migrations that are not yet recorded", async () => {
    const { client, appliedIds, executed } = makeFakeSql();
    appliedIds.push(...MIGRATIONS.slice(0, 2).map((migration) => migration.id));
    await runMigrations(client);
    expect(appliedIds).toEqual(MIGRATIONS.map((migration) => migration.id));
    const ranStatements = executed.filter((sql) => MIGRATIONS[0]?.statements.includes(sql));
    expect(ranStatements).toHaveLength(0);
  });

  it("keeps migration ids unique and ordered", () => {
    const ids = MIGRATIONS.map((migration) => migration.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });

  it("numbers migrations strictly upward", () => {
    const numbers = MIGRATIONS.map((migration) => numericPrefixOf(migration.id));
    for (let index = 1; index < numbers.length; index += 1) {
      const previous = numbers[index - 1] ?? 0;
      const current = numbers[index] ?? 0;
      const because = `${MIGRATIONS[index]?.id} must outrank ${MIGRATIONS[index - 1]?.id}`;
      expect(current, because).toBeGreaterThan(previous);
    }
  });

  it("never reuses a retired migration number", () => {
    const numbers = new Set(MIGRATIONS.map((migration) => numericPrefixOf(migration.id)));
    for (const retired of RETIRED_MIGRATION_IDS) {
      expect(
        numbers.has(Number(retired)),
        `migration number ${retired} was shipped once and is recorded in real _migrations ` +
          "tables; a new migration reusing it would be skipped silently on those databases",
      ).toBe(false);
    }
  });

  it("stays silent about retired ids, warns about truly unknown ones, and still migrates", async () => {
    const { client, appliedIds } = makeFakeSql();
    appliedIds.push(...MIGRATIONS.slice(0, 3).map((migration) => migration.id));
    // Retired tombstones (documented in RETIRED_MIGRATION_IDS) are expected on every machine
    // that ran the deleted feature — they fired a warning on every launch until 2026-08-30.
    appliedIds.push("0038_discovery_feed", "0041_external_content_feed");
    // An id from no known list is real drift and must still be said out loud.
    appliedIds.push("9999_from_a_future_build");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await runMigrations(client);
      expect(warn).toHaveBeenCalledTimes(1);
      const message = String(warn.mock.calls[0]?.[0]);
      expect(message).toContain("9999_from_a_future_build");
      expect(message).not.toContain("0038_discovery_feed");
      expect(message).not.toContain("0041_external_content_feed");
    } finally {
      warn.mockRestore();
    }
    // The unknown ids are left in place and every real migration still ran.
    for (const migration of MIGRATIONS) expect(appliedIds).toContain(migration.id);
    expect(appliedIds).toContain("0038_discovery_feed");
  });

  it("does not warn at all when the only extra ids are retired tombstones", async () => {
    const { client, appliedIds } = makeFakeSql();
    appliedIds.push("0038_discovery_feed", "0039_discovery_clear_unopened_stubs");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await runMigrations(client);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

/** "0049_llm_calls_conversation_index" -> 49. */
function numericPrefixOf(id: string): number {
  const prefix = /^(\d+)_/.exec(id)?.[1];
  expect(prefix, `migration id ${id} must start with a number and an underscore`).toBeDefined();
  return Number(prefix);
}
