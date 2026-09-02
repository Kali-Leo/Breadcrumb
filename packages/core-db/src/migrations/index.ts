/**
 * Purpose: versioned, append-only SQL migrations with exactly-once tracking via the
 * _migrations table. Never edit a shipped migration — append a new one. The list itself is
 * split into numbered segment files purely to keep each under the 200-line ceiling; the
 * concatenation order below IS the migration order, so a new segment always goes last.
 * Append new migrations to the last segment file until it approaches 200 lines, then start a
 * new `NNNN-NNNN.ts` and add it to the spread below.
 * Main exports: MIGRATIONS, Migration, RETIRED_MIGRATION_IDS, runMigrations.
 */

import type { SqlClient } from "../types";
import { MIGRATIONS_0001_0007 } from "./0001-0007";
import { MIGRATIONS_0008_0014 } from "./0008-0014";
import { MIGRATIONS_0015_0021 } from "./0015-0021";
import { MIGRATIONS_0022_0028 } from "./0022-0028";
import { MIGRATIONS_0029_0044 } from "./0029-0044";
import { MIGRATIONS_0045_0052 } from "./0045-0052";
import type { Migration } from "./migration";

export type { Migration } from "./migration";

export const MIGRATIONS: readonly Migration[] = [
  ...MIGRATIONS_0001_0007,
  ...MIGRATIONS_0008_0014,
  ...MIGRATIONS_0015_0021,
  ...MIGRATIONS_0022_0028,
  ...MIGRATIONS_0029_0044,
  ...MIGRATIONS_0045_0052,
];

/**
 * Migration numbers that were shipped once, recorded in real `_migrations` tables, and then
 * deleted from this list — 0038/0039 and 0041-0043 all belonged to the discovery feed, torn
 * out on 2026-08-24. They must never be reused. `runMigrations` skips any id the database has
 * already recorded, so a NEW migration reusing one of these numbers would be silently skipped
 * on exactly the machines that ran the old one, leaving their schema permanently forked from
 * the code with nothing to show for it (design audit 2026-08-28, 数据层与性能 #8).
 */
export const RETIRED_MIGRATION_IDS: readonly string[] = ["0038", "0039", "0041", "0042", "0043"];

/** Applies every migration not yet recorded in _migrations, oldest first, exactly once. */
export async function runMigrations(sql: SqlClient): Promise<void> {
  await sql.execute(
    "CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  // Repair a legacy id: factcheck first shipped as 0005_factcheck and was renumbered to
  // 0006_factcheck when 0005_map_place_names merged ahead of it. Databases migrated under
  // the old id would otherwise re-run the migration and abort on existing tables.
  await sql.execute(
    `UPDATE _migrations SET id = '0006_factcheck'
     WHERE id = '0005_factcheck'
       AND NOT EXISTS (SELECT 1 FROM _migrations WHERE id = '0006_factcheck')`,
  );
  const appliedRows = await sql.select<{ id: string }>("SELECT id FROM _migrations");
  const applied = new Set(appliedRows.map((row) => row.id));
  warnAboutUnknownAppliedIds(applied);
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    // One transaction per migration, bookkeeping row included: a crash mid-migration leaves
    // it cleanly unapplied instead of half-applied (which would re-run on next boot and
    // abort on "table already exists", bricking startup). Safe because every migration here
    // is plain DDL/DML — SQLite allows all of it, including 0027's table rebuild, inside a
    // transaction (no PRAGMA/VACUUM/ATTACH statements exist in this list).
    await sql.executeTransaction([
      ...migration.statements.map((statement) => ({ sql: statement })),
      {
        sql: "INSERT INTO _migrations (id, applied_at) VALUES (?, ?)",
        params: [migration.id, new Date().toISOString()],
      },
    ]);
  }
}

/**
 * The ledger check: every id this database has recorded should still exist in MIGRATIONS —
 * or in RETIRED_MIGRATION_IDS, the documented tombstones of deleted features. A recorded id
 * in neither list means the database ran a migration this code has never heard of: that IS
 * worth saying out loud, because the same mechanism that makes it harmless (skip what's
 * recorded) is what would make a reused number vanish without a trace.
 *
 * Retired ids are deliberately silent (2026-08-30): they are expected on every machine that
 * ran the deleted feature, the reuse hazard is already institutionalized in the retired
 * list, and a startup warning nobody can act on is noise — it fired on every launch.
 *
 * A warning, never a throw: the drift is already in the past by the time we can see it, and
 * refusing to start would brick the app over a row that costs nothing to carry.
 */
function warnAboutUnknownAppliedIds(applied: ReadonlySet<string>): void {
  const knownIds = new Set(MIGRATIONS.map((migration) => migration.id));
  const retired = (id: string) =>
    RETIRED_MIGRATION_IDS.some((numberPrefix) => id.startsWith(`${numberPrefix}_`));
  const unknownIds = [...applied].filter((id) => !knownIds.has(id) && !retired(id)).sort();
  if (unknownIds.length === 0) return;
  console.warn(
    `_migrations records ${unknownIds.length} id(s) this build does not know: ` +
      `${unknownIds.join(", ")}. They were applied by an older build and are being left ` +
      "alone. Never reuse one of these numbers for a new migration — this database would " +
      "skip it silently and its schema would fork from the code with no error anywhere.",
  );
}
