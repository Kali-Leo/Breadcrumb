#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
/**
 * Purpose: CLI entry for the zero-LLM feedback-lab demo seed (spec 035 T7b) — opens a
 * caller-specified SQLite file, migrates it, wipes any previous demo rows, and (unless
 * --wipe) writes a fresh deterministic demo landscape anchored at "now".
 * Main exports: none — run via `pnpm --filter @breadcrumb/simlab seed-demo -- <db-path> [--wipe]`.
 */
import { runMigrations } from "@breadcrumb/core-db";
import { insertDemoData, wipeDemoData } from "@breadcrumb/demo-seed";
import Database from "better-sqlite3";
import { createSqliteClient } from "../db/sqliteClient";

/** The CLI has a filesystem, so it reads the bundled pack and passes it in; the app imports
 * the same JSON as a module instead. */
const PACK_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../apps/desktop/src/assets/language-packs/zh-en.json",
);

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

    const summary = await insertDemoData(sql, new Date(), {
      languagePack: JSON.parse(readFileSync(PACK_PATH, "utf-8")) as unknown,
    });
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
