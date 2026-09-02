/**
 * Purpose: unit tests for exactly-once migration tracking using a fake SqlClient, plus the
 * guard that splitting the list into numbered segment files did not change a single id.
 */
import { describe, expect, it, vi } from "vitest";
import { withSequentialTransactions } from "../transactionFallback";
import type { SqlClient } from "../types";
import { MIGRATIONS, RETIRED_MIGRATION_IDS, runMigrations } from "./index";

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

/**
 * The exact id sequence MIGRATIONS held on 2026-09-02, immediately before the single
 * migrations.ts was split into the numbered segment files this directory now contains
 * (`git show 1535e0a:packages/core-db/src/migrations.ts`). A shipped database records these
 * ids in its _migrations table, so reordering, renaming or dropping any of them would make
 * existing installs re-run or silently skip migrations. Appending is fine — the assertion
 * below only pins the prefix.
 */
const IDS_BEFORE_THE_SPLIT: readonly string[] = [
  "0001_initial",
  "0002_knowledge_and_trail",
  "0003_user_level_tree",
  "0004_node_embeddings",
  "0005_map_place_names",
  "0006_factcheck",
  "0007_knowledge_edges",
  "0008_interest_and_claims",
  "0009_goals",
  "0010_ai_failures",
  "0011_interest_signal_confidence",
  "0012_node_aliases",
  "0013_goal_ladders",
  "0014_goal_ladders_v2",
  "0015_goal_ladder_v4",
  "0016_goal_ladder_self_title",
  "0017_goal_ladder_assessment_board",
  "0018_comparison_profiles",
  "0019_comparison_alignments",
  "0020_canonical_anchors",
  "0021_occupation_practice",
  "0022_practice_scores",
  "0023_goal_title_ladder",
  "0024_drop_ladder_tables",
  "0025_diglot_weave",
  "0026_diglot_context_embeddings",
  "0027_teach_quality_claims",
  "0028_research_tasks",
  "0029_companion_cast",
  "0030_message_teaching_mode",
  "0031_message_parent",
  "0032_conversation_auto_title",
  "0033_sighting_origin",
  "0034_focus_sessions",
  "0035_focus_session_source_message",
  "0036_term_marks",
  "0037_companion_proposal_kind",
  "0040_study_mode",
  "0044_sighting_grades",
  "0045_dedup_bookkeeping",
  "0046_canonical_concept_embeddings",
  "0047_ascii_alignment_confidence",
  "0048_edge_reasoning_provenance",
  "0049_llm_calls_conversation_index",
  "0050_llm_calls_cached_input_tokens",
  "0051_diglot_pack_payload",
  "0052_drop_dead_table_and_indexes",
];

describe("the segment-file split", () => {
  it("concatenates back into the exact id sequence that shipped before it", () => {
    const ids = MIGRATIONS.map((migration) => migration.id);
    expect(ids.length).toBeGreaterThanOrEqual(IDS_BEFORE_THE_SPLIT.length);
    expect(ids.slice(0, IDS_BEFORE_THE_SPLIT.length)).toEqual(IDS_BEFORE_THE_SPLIT);
  });
});

/** "0049_llm_calls_conversation_index" -> 49. */
function numericPrefixOf(id: string): number {
  const prefix = /^(\d+)_/.exec(id)?.[1];
  expect(prefix, `migration id ${id} must start with a number and an underscore`).toBeDefined();
  return Number(prefix);
}
