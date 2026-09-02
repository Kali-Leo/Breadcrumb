/**
 * Purpose: the two queries behind the daily trail summary against a real migrated database
 * — listSightedBetween must count a node met AGAIN that day (not only first-met nodes) and
 * must not count footprints outside the window; listSince must return the last days' rows
 * newest first.
 */
import { describe, expect, it } from "vitest";
import { createTrailSummariesRepo } from "./featureRepositories";
import { createKnowledgeNodesRepo } from "./nodesRepository";
import { openMigratedDatabase } from "./realSqliteTestFixture";

describe("listSightedBetween", () => {
  it("returns every node with a footprint inside the window, re-encounters included", async () => {
    const database = await openMigratedDatabase();
    try {
      const { sql } = database;
      await sql.execute(
        "INSERT INTO conversations (id,title,created_at,updated_at,kind) VALUES (?,?,?,?,?)",
        ["c1", "t", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z", "chat"],
      );
      for (const [id, label] of [
        ["old", "闭包"],
        ["fresh", "事件循环"],
        ["outside", "原型链"],
      ]) {
        await sql.execute(
          "INSERT INTO knowledge_nodes (id,parent_id,label,summary,created_at,kind) VALUES (?,?,?,?,?,?)",
          [id, null, label, "", "2026-01-01T00:00:00Z", "concept"],
        );
      }
      const footprint = async (id: string, nodeId: string, at: string) =>
        sql.execute(
          "INSERT INTO node_sightings (id,node_id,conversation_id,message_id,created_at,grade) VALUES (?,?,?,?,?,?)",
          [id, nodeId, "c1", null, at, "good"],
        );
      // "old" was first met in January and met again inside the window.
      await footprint("s1", "old", "2026-01-05T10:00:00Z");
      await footprint("s2", "old", "2026-03-10T12:00:00Z");
      await footprint("s3", "fresh", "2026-03-10T09:00:00Z");
      await footprint("s4", "outside", "2026-03-11T00:00:00Z");

      const nodes = await createKnowledgeNodesRepo(sql).listSightedBetween(
        "2026-03-10T00:00:00Z",
        "2026-03-11T00:00:00Z",
      );
      expect(nodes.map((node) => node.id)).toEqual(["fresh", "old"]);
    } finally {
      database.close();
    }
  });
});

describe("trail summaries listSince", () => {
  it("returns the rows dated on or after the cutoff, newest first", async () => {
    const database = await openMigratedDatabase();
    try {
      const repo = createTrailSummariesRepo(database.sql);
      for (const date of ["2026-03-01", "2026-03-08", "2026-03-10"]) {
        await repo.set({ date, content: `${date} 的一句`, created_at: "t" });
      }
      const rows = await repo.listSince("2026-03-04");
      expect(rows.map((row) => row.date)).toEqual(["2026-03-10", "2026-03-08"]);
    } finally {
      database.close();
    }
  });
});
