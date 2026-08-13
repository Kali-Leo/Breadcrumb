#!/usr/bin/env node
/**
 * Purpose: CLI entry for the zero-LLM feedback-lab demo seed (spec 035 T7b) — opens a
 * caller-specified SQLite file, migrates it, wipes any previous demo rows, and (unless
 * --wipe) writes a fresh deterministic demo landscape anchored at "now".
 * Main exports: none — run via `pnpm --filter @breadcrumb/simlab seed-demo -- <db-path> [--wipe]`.
 */
import { runMigrations } from "@breadcrumb/core-db";
import Database from "better-sqlite3";
import { createSqliteClient } from "../db/sqliteClient";
import { insertDemoData, wipeDemoData } from "../seedDemo";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const wipeOnly = args.includes("--wipe");
  const dbPath = args.find((arg) => !arg.startsWith("--"));
  if (dbPath === undefined) {
    console.error("usage: seed-demo <db-path> [--wipe]");
    process.exitCode = 1;
    return;
  }

  const db = new Database(dbPath);
  try {
    const sql = createSqliteClient(db);
    await runMigrations(sql);
    await wipeDemoData(sql);
    console.log(`demo rows wiped from ${dbPath}`);
    if (wipeOnly) return;

    const summary = await insertDemoData(sql, new Date());
    console.log("demo data inserted:");
    for (const [table, count] of Object.entries(summary)) {
      console.log(`  ${table}: ${count}`);
    }
  } finally {
    db.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
