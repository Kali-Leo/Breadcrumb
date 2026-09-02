/**
 * Purpose: createMapPlaceNamesRepo against a real in-memory SQLite — the precedence the
 * schema promises: a user name is never overwritten by an AI suggestion, a user name does
 * replace an AI one, and removeOverride restores the original by leaving no row behind.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createMapPlaceNamesRepo } from "./featureRepositories";
import { openMigratedDatabase, type RealSqliteDatabase } from "./realSqliteTestFixture";

const NOW = "2026-09-02T10:00:00.000Z";
const LATER = "2026-09-02T11:00:00.000Z";

describe("createMapPlaceNamesRepo", () => {
  let database: RealSqliteDatabase | null = null;

  afterEach(() => {
    database?.close();
    database = null;
  });

  async function open() {
    database = await openMigratedDatabase();
    await database.sql.execute(
      "INSERT INTO knowledge_nodes (id, parent_id, label, summary, created_at, kind) VALUES (?, NULL, ?, ?, ?, 'concept')",
      ["n1", "闭包", "说明", NOW],
    );
    return createMapPlaceNamesRepo(database.sql);
  }

  it("keeps the user's name when an AI suggestion arrives later", async () => {
    const repo = await open();
    await repo.upsert({ node_id: "n1", custom_label: "我的岛", source: "user", updated_at: NOW });
    await repo.upsert({ node_id: "n1", custom_label: "AI 岛", source: "ai", updated_at: LATER });
    expect(await repo.listAll()).toEqual([
      { node_id: "n1", custom_label: "我的岛", source: "user", updated_at: NOW },
    ]);
  });

  it("lets the user's name replace an AI suggestion, and restores by removing the row", async () => {
    const repo = await open();
    await repo.upsert({ node_id: "n1", custom_label: "AI 岛", source: "ai", updated_at: NOW });
    await repo.upsert({ node_id: "n1", custom_label: "我的岛", source: "user", updated_at: LATER });
    expect((await repo.listAll()).map((row) => row.custom_label)).toEqual(["我的岛"]);
    await repo.removeOverride("n1");
    expect(await repo.listAll()).toEqual([]);
  });
});
