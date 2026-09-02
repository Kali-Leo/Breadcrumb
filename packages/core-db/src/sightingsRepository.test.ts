/**
 * Purpose: createNodeSightingsRepo's firstWithMessage against a real migrated database — the
 * JOIN has to skip footprints whose message is gone rather than return a dead link.
 */
import { describe, expect, it } from "vitest";
import { openMigratedDatabase } from "./realSqliteTestFixture";
import { createNodeSightingsRepo } from "./sightingsRepository";

describe("firstWithMessage", () => {
  it("finds the earliest footprint that still points at a message", async () => {
    const database = await openMigratedDatabase();
    try {
      const { sql } = database;
      await sql.execute(
        "INSERT INTO conversations (id,title,created_at,updated_at,kind) VALUES (?,?,?,?,?)",
        ["c1", "t", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z", "chat"],
      );
      await sql.execute(
        "INSERT INTO messages (id,conversation_id,role,content,created_at) VALUES (?,?,?,?,?)",
        ["m-late", "c1", "user", "…", "2026-02-01T00:00:00Z"],
      );
      await sql.execute(
        "INSERT INTO knowledge_nodes (id,parent_id,label,summary,created_at,kind) VALUES (?,?,?,?,?,?)",
        ["n1", null, "闭包", "", "2026-01-01T00:00:00Z", "concept"],
      );
      // Earliest footprint has no message (an old row); the next one does and must win.
      await sql.execute(
        "INSERT INTO node_sightings (id,node_id,conversation_id,message_id,created_at,grade) VALUES (?,?,?,?,?,?)",
        ["s-old", "n1", "c1", null, "2026-01-01T00:00:00Z", "good"],
      );
      await sql.execute(
        "INSERT INTO node_sightings (id,node_id,conversation_id,message_id,created_at,grade) VALUES (?,?,?,?,?,?)",
        ["s-late", "n1", "c1", "m-late", "2026-02-01T00:00:00Z", "good"],
      );
      const repo = createNodeSightingsRepo(sql);
      expect((await repo.firstWithMessage("n1"))?.id).toBe("s-late");
      expect(await repo.firstWithMessage("nobody")).toBeNull();
    } finally {
      database.close();
    }
  });
});
