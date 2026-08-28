/**
 * Purpose: tests for the dedup sweep's negative cache (migration 0045) and for migration
 * 0047's rewrite of the alignment confidence tier from 高/中/低 to ASCII — both against a real
 * SQLite database, since both are about what the schema actually enforces.
 */
import { afterEach, describe, expect, it } from "vitest";
import { runMigrations } from "./migrations";
import { createNodePairVerdictsRepo, normalizeNodePairKey } from "./nodePairVerdictRepository";
import {
  openDatabaseMigratedThrough,
  openMigratedDatabase,
  type RealSqliteDatabase,
} from "./realSqliteTestFixture";

const NOW = "2026-08-28T10:00:00.000Z";

describe("normalizeNodePairKey", () => {
  it("orders the two ids the same way whichever side is given first", () => {
    expect(normalizeNodePairKey("b", "a")).toEqual({ nodeAId: "a", nodeBId: "b" });
    expect(normalizeNodePairKey("a", "b")).toEqual({ nodeAId: "a", nodeBId: "b" });
  });
});

describe("node_pair_verdicts", () => {
  let database: RealSqliteDatabase | null = null;
  afterEach(() => {
    database?.close();
    database = null;
  });

  it("stores a 'different' verdict once, whichever order the pair arrives in", async () => {
    database = await openMigratedDatabase();
    const repo = createNodePairVerdictsRepo(database.sql);
    await repo.record("node-b", "node-a", "different", NOW);
    await repo.record("node-a", "node-b", "different", NOW);

    const rows = await repo.listAll();
    expect(rows).toEqual([
      { node_a_id: "node-a", node_b_id: "node-b", verdict: "different", judged_at: NOW },
    ]);
  });

  it("rejects a verdict value outside same/different", async () => {
    database = await openMigratedDatabase();
    await expect(
      database.sql.execute("INSERT INTO node_pair_verdicts VALUES ('a', 'b', 'maybe', ?)", [NOW]),
    ).rejects.toThrow();
  });
});

describe("migration 0047 (ASCII alignment confidence)", () => {
  let database: RealSqliteDatabase | null = null;
  afterEach(() => {
    database?.close();
    database = null;
  });

  it("maps existing 高/中/低 anchor rows onto high/medium/low and keeps everything else", async () => {
    // Frozen just before 0047, where the CHECK constraint still demands the Chinese tiers.
    database = await openDatabaseMigratedThrough("0046_canonical_concept_embeddings");
    await database.sql.execute(
      "INSERT INTO knowledge_nodes (id, parent_id, label, summary, kind, created_at) VALUES ('n1', NULL, 'l', 's', 'concept', ?)",
      [NOW],
    );
    await database.sql.execute("INSERT INTO canonical_concepts VALUES (?, ?, '[]', 'ref', ?)", [
      "c1",
      "概念",
      NOW,
    ]);
    await database.sql.execute("INSERT INTO canonical_concepts VALUES (?, ?, '[]', 'ref', ?)", [
      "c2",
      "概念二",
      NOW,
    ]);
    await database.sql.execute("INSERT INTO canonical_concepts VALUES (?, ?, '[]', 'ref', ?)", [
      "c3",
      "概念三",
      NOW,
    ]);
    for (const [conceptId, confidence] of [
      ["c1", "高"],
      ["c2", "中"],
      ["c3", "低"],
    ] as const) {
      await database.sql.execute(
        "INSERT INTO node_concept_anchors VALUES ('n1', ?, 'same', ?, 'judge', '理由', ?)",
        [conceptId, confidence, NOW],
      );
    }
    // Now let the remaining migrations run over that populated database — the real upgrade.
    await runMigrations(database.sql);

    const rows = await database.sql.select<{ concept_id: string; confidence: string }>(
      "SELECT concept_id, confidence FROM node_concept_anchors ORDER BY concept_id",
    );
    expect(rows).toEqual([
      { concept_id: "c1", confidence: "high" },
      { concept_id: "c2", confidence: "medium" },
      { concept_id: "c3", confidence: "low" },
    ]);
    // The rebuilt table's other columns and its index survived.
    const reason = await database.sql.select<{ reason: string; method: string }>(
      "SELECT reason, method FROM node_concept_anchors WHERE concept_id = 'c1'",
    );
    expect(reason[0]).toEqual({ reason: "理由", method: "judge" });
    await expect(
      database.sql.execute(
        "INSERT INTO node_concept_anchors VALUES ('n1', 'c1', 'same', '高', 'judge', 'r', ?)",
        [NOW],
      ),
    ).rejects.toThrow(); // the Chinese tier is no longer a legal value
  });
});
