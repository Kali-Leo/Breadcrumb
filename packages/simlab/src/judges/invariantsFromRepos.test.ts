/**
 * Purpose: bad-data injection self-check against a REAL temp SQLite database — directly
 * INSERTs a cyclic edge and a duplicate-label node via raw SQL (bypassing the app's own
 * write paths, which would normally prevent this), proving the tripwire suite actually
 * catches corruption rather than trusting the writers that are supposed to prevent it.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createTempDatabase, type TempDatabase } from "../db/sqliteClient";
import { runInvariantsFromRepos } from "./invariantsFromRepos";

let temp: TempDatabase | null = null;

afterEach(() => {
  temp?.close();
  temp = null;
});

describe("runInvariantsFromRepos: bad-data injection", () => {
  it("is clean on an empty database", async () => {
    temp = await createTempDatabase();
    expect(await runInvariantsFromRepos(temp.repos, "2026-08-01T00:00:00.000Z")).toEqual([]);
  });

  it("catches a cyclic requires-edge set inserted directly via SQL", async () => {
    temp = await createTempDatabase();
    const now = "2026-08-01T00:00:00.000Z";
    const seedNodes: [string, string][] = [
      ["a", "A"],
      ["b", "B"],
      ["c", "C"],
    ];
    for (const [id, label] of seedNodes) {
      await temp.repos.knowledgeNodes.insert({
        id,
        parent_id: null,
        label,
        summary: "s",
        kind: "concept",
        created_at: now,
      });
    }
    // Bypass planEdgeJudgeResult's cycle guard entirely — raw SQL, as a real corruption would be.
    await temp.sql.execute(
      "INSERT INTO knowledge_edges (id, source_id, target_id, edge_type, weight, confidence, origin, created_at) VALUES (?,?,?,?,?,?,?,?)",
      ["e1", "a", "b", "requires", 1, 0.9, "llm", now],
    );
    await temp.sql.execute(
      "INSERT INTO knowledge_edges (id, source_id, target_id, edge_type, weight, confidence, origin, created_at) VALUES (?,?,?,?,?,?,?,?)",
      ["e2", "b", "c", "requires", 1, 0.9, "llm", now],
    );
    await temp.sql.execute(
      "INSERT INTO knowledge_edges (id, source_id, target_id, edge_type, weight, confidence, origin, created_at) VALUES (?,?,?,?,?,?,?,?)",
      ["e3", "c", "a", "requires", 1, 0.9, "llm", now],
    );

    const violations = await runInvariantsFromRepos(temp.repos, now);
    expect(violations.some((v) => v.kind === "cycle")).toBe(true);
  });

  it("the schema's own UNIQUE(label) constraint rejects a duplicate label at the SQL layer", async () => {
    // knowledge_nodes.label is UNIQUE (migration 0003), so real duplicate-label corruption
    // can't reach a migrated database this way — checkUniqueLabels in invariants.ts is
    // defense-in-depth, exercised directly against a constructed node array in
    // invariants.test.ts. Here we confirm the DB-level guarantee it backs up actually holds.
    temp = await createTempDatabase();
    const now = "2026-08-01T00:00:00.000Z";
    await temp.repos.knowledgeNodes.insert({
      id: "a",
      parent_id: null,
      label: "闭包",
      summary: "s",
      kind: "concept",
      created_at: now,
    });
    await expect(
      temp.repos.knowledgeNodes.insert({
        id: "b",
        parent_id: null,
        label: "闭包",
        summary: "s2",
        kind: "concept",
        created_at: now,
      }),
    ).rejects.toThrow();
  });
});
