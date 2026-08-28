/**
 * Purpose: real-SQLite tests for the sighting grade column (migration 0044) — the insert path
 * defaults to passive exposure, an explicit retrieval grade survives the round trip, and rows
 * written before the migration are backfilled rather than left NULL.
 */
import { describe, expect, it } from "vitest";
import { createNodeSightingsRepo } from "./knowledgeRepositories";
import { runMigrations } from "./migrations";
import { openDatabaseMigratedThrough, openMigratedDatabase } from "./realSqliteTestFixture";
import type { NodeSightingGrade, NodeSightingRow, SqlClient } from "./types";

const CONVERSATION_ID = "c1";
const NODE_ID = "n1";

/** node_sightings has real foreign keys onto conversations and knowledge_nodes. */
async function seedParents(sql: SqlClient): Promise<void> {
  await sql.execute(
    "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
    [CONVERSATION_ID, "对话", "2026-08-28T00:00:00.000Z", "2026-08-28T00:00:00.000Z"],
  );
  await sql.execute(
    "INSERT INTO knowledge_nodes (id, parent_id, label, summary, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [NODE_ID, null, "闭包", "", "concept", "2026-08-28T00:00:00.000Z"],
  );
}

function sighting(id: string, grade?: NodeSightingGrade): NodeSightingRow {
  return {
    id,
    node_id: NODE_ID,
    conversation_id: CONVERSATION_ID,
    message_id: null,
    created_at: `2026-08-28T00:00:0${id.length}.000Z`,
    origin_node_id: null,
    ...(grade === undefined ? {} : { grade }),
  };
}

describe("node_sightings.grade", () => {
  it("stores the passive default when the caller has no retrieval signal", async () => {
    const database = await openMigratedDatabase();
    try {
      await seedParents(database.sql);
      const repo = createNodeSightingsRepo(database.sql);
      await repo.record(sighting("s"));
      const [row] = await repo.listAll();
      expect(row?.grade).toBe("good");
    } finally {
      database.close();
    }
  });

  it("round-trips each of the four grades, negative one included", async () => {
    const database = await openMigratedDatabase();
    try {
      await seedParents(database.sql);
      const repo = createNodeSightingsRepo(database.sql);
      const grades: NodeSightingGrade[] = ["again", "hard", "good", "easy"];
      for (const [index, grade] of grades.entries()) {
        await repo.record(sighting("s".repeat(index + 1), grade));
      }
      const stored = (await repo.listAll()).map((row) => row.grade);
      expect(stored).toEqual(grades);
    } finally {
      database.close();
    }
  });

  it("backfills footprints written before the migration as passive exposure", async () => {
    // A database frozen one migration before 0044, holding a footprint from back then: every
    // pre-0044 sighting was an ungraded mention, which is exactly what 'good' means.
    const database = await openDatabaseMigratedThrough("0040_study_mode");
    try {
      await seedParents(database.sql);
      await database.sql.execute(
        "INSERT INTO node_sightings (id, node_id, conversation_id, message_id, created_at) VALUES (?, ?, ?, ?, ?)",
        ["legacy", NODE_ID, CONVERSATION_ID, null, "2026-08-01T00:00:00.000Z"],
      );
      await runMigrations(database.sql);
      const [row] = await createNodeSightingsRepo(database.sql).listAll();
      expect(row?.id).toBe("legacy");
      expect(row?.grade).toBe("good");
    } finally {
      database.close();
    }
  });
});
