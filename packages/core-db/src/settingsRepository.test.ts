/**
 * Purpose: regression test for the one read in the whole data layer that used to throw on a
 * bad row. `settingsRepository.get` did `JSON.parse(row.value_json)` bare, and its caller
 * chain — settingsStoreLoad's Promise.all, settingsStore.load, App.tsx's startup IIFE — has
 * no catch anywhere in it, so a single unparseable row stopped the app on the loading screen
 * permanently, with chat, diglot, knowledge and companion never initialized and no way back
 * from inside the UI.
 */
import { afterEach, describe, expect, it } from "vitest";
import { openMigratedDatabase, type RealSqliteDatabase } from "./realSqliteTestFixture";
import { createSettingsRepo } from "./settingsRepository";

describe("settingsRepository.get", () => {
  let database: RealSqliteDatabase | null = null;

  afterEach(() => {
    database?.close();
    database = null;
  });

  it("returns null instead of throwing when value_json will not parse", async () => {
    database = await openMigratedDatabase();
    // A truncated write, a hand edit, a bad disk block — they all reach the reader as this.
    await database.sql.execute("INSERT INTO settings VALUES (?, ?, ?)", [
      "featureSwitches",
      '{"knowledgeTree":',
      "2026-09-04T00:00:00Z",
    ]);

    await expect(createSettingsRepo(database.sql).get("featureSwitches")).resolves.toBeNull();
  });

  it("still round-trips a value that was written properly", async () => {
    database = await openMigratedDatabase();
    const repo = createSettingsRepo(database.sql);
    await repo.set("apiConfig", { model: "m", baseUrl: "u" }, "2026-09-04T00:00:00Z");

    await expect(repo.get("apiConfig")).resolves.toEqual({ model: "m", baseUrl: "u" });
  });

  it("returns null for a key that was never written", async () => {
    database = await openMigratedDatabase();

    await expect(createSettingsRepo(database.sql).get("missing")).resolves.toBeNull();
  });

  it("reads a stored null back as null", async () => {
    database = await openMigratedDatabase();
    const repo = createSettingsRepo(database.sql);
    await repo.set("networkEnabled", null, "2026-09-04T00:00:00Z");

    await expect(repo.get("networkEnabled")).resolves.toBeNull();
  });
});
