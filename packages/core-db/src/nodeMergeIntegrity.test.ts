/**
 * Purpose: the regression tests for the three ways a merge used to damage data instead of
 * failing loudly — a parent cycle that made the canonical and its whole subtree disappear
 * from the map, a `goals.node_ids_json` left pointing at the deleted node, and the
 * read-then-write window where an edge written between the read and the transaction failed
 * the whole merge. Real SQLite, foreign keys enforced, through the real repo.
 * Companion to nodeMergeRepository.test.ts, which owns the referencing-table tripwire.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { KnowledgeEdgeRow } from "./knowledgeTypes";
import { createNodeMergeRepo } from "./nodeMergeRepository";
import { openMigratedDatabase, type RealSqliteDatabase } from "./realSqliteTestFixture";
import type { SqlClient } from "./types";

const NOW = "2026-09-04T10:00:00.000Z";

interface NodeShape {
  id: string;
  parent: string | null;
}

async function seedNodes(sql: SqlClient, nodes: readonly NodeShape[]): Promise<void> {
  for (const [index, node] of nodes.entries()) {
    await sql.execute(
      "INSERT INTO knowledge_nodes (id, parent_id, label, summary, kind, created_at) VALUES (?, ?, ?, ?, 'concept', ?)",
      [node.id, node.parent, `标签-${node.id}`, "说明", `2026-08-0${index + 1}T00:00:00Z`],
    );
  }
}

async function readParents(sql: SqlClient): Promise<Map<string, string | null>> {
  const rows = await sql.select<{ id: string; parent_id: string | null }>(
    "SELECT id, parent_id FROM knowledge_nodes ORDER BY id",
  );
  return new Map(rows.map((row) => [row.id, row.parent_id]));
}

/**
 * Exactly what feature-map's indexChildren did before it learned about cycles: bucket every
 * node under its parent, then walk down from the parent-less ones. A node on a cycle is in
 * nobody's bucket and in no root, so it silently never appears — which is the whole bug.
 */
function reachableFromRoots(parents: ReadonlyMap<string, string | null>): Set<string> {
  const children = new Map<string | null, string[]>();
  for (const [id, parent] of parents) {
    const key = parent !== null && parents.has(parent) ? parent : null;
    children.set(key, [...(children.get(key) ?? []), id]);
  }
  const reached = new Set<string>();
  const queue = [...(children.get(null) ?? [])];
  for (let head = 0; head < queue.length && head < 10_000; head += 1) {
    const id = queue[head];
    if (id === undefined || reached.has(id)) continue;
    reached.add(id);
    queue.push(...(children.get(id) ?? []));
  }
  return reached;
}

describe("merging a node that is a descendant of its duplicate", () => {
  let database: RealSqliteDatabase | null = null;

  afterEach(() => {
    database?.close();
    database = null;
  });

  it("keeps the canonical and its subtree on the map when the duplicate is its parent", async () => {
    database = await openMigratedDatabase();
    // root -> dup -> canon -> leaf. Merging canon (child) with dup (its parent) used to set
    // canon.parent_id = canon, and canon + leaf vanished from every map view.
    await seedNodes(database.sql, [
      { id: "root", parent: null },
      { id: "dup", parent: "root" },
      { id: "canon", parent: "dup" },
      { id: "leaf", parent: "canon" },
    ]);

    await createNodeMergeRepo(database.sql).mergeNode("canon", "dup", "标签-dup", NOW, "merge-1");

    const parents = await readParents(database.sql);
    expect(parents.get("canon")).toBe("root"); // took the duplicate's own place in the tree
    expect(parents.get("leaf")).toBe("canon");
    expect([...reachableFromRoots(parents)].sort()).toEqual(["canon", "leaf", "root"]);
  });

  it("keeps them when the duplicate is a distant ancestor", async () => {
    database = await openMigratedDatabase();
    await seedNodes(database.sql, [
      { id: "root", parent: null },
      { id: "dup", parent: "root" },
      { id: "mid", parent: "dup" },
      { id: "canon", parent: "mid" },
    ]);

    await createNodeMergeRepo(database.sql).mergeNode("canon", "dup", "标签-dup", NOW, "merge-1");

    const parents = await readParents(database.sql);
    expect(parents.get("canon")).toBe("root");
    expect(parents.get("mid")).toBe("canon");
    expect([...reachableFromRoots(parents)].sort()).toEqual(["canon", "mid", "root"]);
  });

  it("degrades the canonical to a root when the duplicate was one", async () => {
    database = await openMigratedDatabase();
    await seedNodes(database.sql, [
      { id: "dup", parent: null },
      { id: "canon", parent: "dup" },
    ]);

    await createNodeMergeRepo(database.sql).mergeNode("canon", "dup", "标签-dup", NOW, "merge-1");

    expect((await readParents(database.sql)).get("canon")).toBeNull();
  });

  it("does not close a loop when the pair was already a cycle", async () => {
    database = await openMigratedDatabase();
    await seedNodes(database.sql, [
      { id: "canon", parent: null },
      { id: "dup", parent: "canon" },
    ]);
    await database.sql.execute("UPDATE knowledge_nodes SET parent_id = 'dup' WHERE id = 'canon'");

    await createNodeMergeRepo(database.sql).mergeNode("canon", "dup", "标签-dup", NOW, "merge-1");

    expect((await readParents(database.sql)).get("canon")).toBeNull();
  });

  it("leaves an unrelated canonical's parent alone", async () => {
    database = await openMigratedDatabase();
    await seedNodes(database.sql, [
      { id: "root", parent: null },
      { id: "canon", parent: "root" },
      { id: "dup", parent: "root" },
      { id: "leaf", parent: "dup" },
    ]);

    await createNodeMergeRepo(database.sql).mergeNode("canon", "dup", "标签-dup", NOW, "merge-1");

    const parents = await readParents(database.sql);
    expect(parents.get("canon")).toBe("root");
    expect(parents.get("leaf")).toBe("canon");
  });
});

describe("merging a node a goal points at", () => {
  let database: RealSqliteDatabase | null = null;

  afterEach(() => {
    database?.close();
    database = null;
  });

  async function goalNodeIds(sql: SqlClient, id: string): Promise<unknown> {
    const rows = await sql.select<{ node_ids_json: string }>(
      "SELECT node_ids_json FROM goals WHERE id = ?",
      [id],
    );
    return JSON.parse(rows[0]?.node_ids_json ?? "null");
  }

  async function seedGoal(sql: SqlClient, id: string, nodeIds: readonly string[]): Promise<void> {
    await sql.execute(
      "INSERT INTO goals (id, title, node_ids_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [id, `目标-${id}`, JSON.stringify(nodeIds), NOW, NOW],
    );
  }

  it("re-points the goal at the canonical instead of leaving a dead id", async () => {
    database = await openMigratedDatabase();
    await seedNodes(database.sql, [
      { id: "canon", parent: null },
      { id: "dup", parent: null },
      { id: "other", parent: null },
    ]);
    await seedGoal(database.sql, "goal-1", ["other", "dup"]);

    await createNodeMergeRepo(database.sql).mergeNode("canon", "dup", "标签-dup", NOW, "merge-1");

    expect(await goalNodeIds(database.sql, "goal-1")).toEqual(["other", "canon"]);
  });

  it("de-duplicates when the goal already listed both sides", async () => {
    database = await openMigratedDatabase();
    await seedNodes(database.sql, [
      { id: "canon", parent: null },
      { id: "dup", parent: null },
    ]);
    await seedGoal(database.sql, "goal-1", ["canon", "dup"]);

    await createNodeMergeRepo(database.sql).mergeNode("canon", "dup", "标签-dup", NOW, "merge-1");

    expect(await goalNodeIds(database.sql, "goal-1")).toEqual(["canon"]);
  });

  it("leaves goals that never mentioned the duplicate untouched", async () => {
    database = await openMigratedDatabase();
    await seedNodes(database.sql, [
      { id: "canon", parent: null },
      { id: "dup", parent: null },
      { id: "other", parent: null },
    ]);
    await seedGoal(database.sql, "goal-1", ["other"]);
    await seedGoal(database.sql, "goal-2", "not json at all" as unknown as string[]);

    await createNodeMergeRepo(database.sql).mergeNode("canon", "dup", "标签-dup", NOW, "merge-1");

    expect(await goalNodeIds(database.sql, "goal-1")).toEqual(["other"]);
    const unreadable = await database.sql.select<{ node_ids_json: string }>(
      "SELECT node_ids_json FROM goals WHERE id = 'goal-2'",
    );
    expect(unreadable[0]?.node_ids_json).toBe('"not json at all"');
  });
});

describe("an edge written while the merge is being prepared", () => {
  let database: RealSqliteDatabase | null = null;

  afterEach(() => {
    database?.close();
    database = null;
  });

  async function seedEdge(
    sql: SqlClient,
    edge: Pick<KnowledgeEdgeRow, "id" | "source_id" | "target_id" | "confidence">,
  ): Promise<void> {
    await sql.execute(
      "INSERT INTO knowledge_edges (id, source_id, target_id, edge_type, weight, confidence, origin, created_at) VALUES (?, ?, ?, 'helps', 0.5, ?, 'llm', ?)",
      [edge.id, edge.source_id, edge.target_id, edge.confidence, NOW],
    );
  }

  it("is folded onto the canonical instead of failing the whole merge", async () => {
    database = await openMigratedDatabase();
    const inner = database.sql;
    await seedNodes(inner, [
      { id: "canon", parent: null },
      { id: "dup", parent: null },
      { id: "x", parent: null },
    ]);

    // The real window: runDedupSweep is fire-and-forget while a chat round's edge judge
    // writes knowledge_edges. This client inserts that edge during mergeNode's own reads,
    // i.e. after the old code had taken its snapshot and before the transaction opened.
    let injected = false;
    const racing: SqlClient = {
      select: async <Row>(sql: string, params?: readonly unknown[]) => {
        const rows = await inner.select<Row>(sql, params);
        // Hooked on the duplicate-row read, which both the old snapshot-based merge and the
        // set-based one issue, so this test means the same thing against either.
        if (!injected && sql.includes("FROM knowledge_nodes WHERE id = ?")) {
          injected = true;
          await seedEdge(inner, { id: "e-new", source_id: "dup", target_id: "x", confidence: 0.7 });
        }
        return rows;
      },
      execute: inner.execute.bind(inner),
      executeTransaction: inner.executeTransaction.bind(inner),
    };

    await createNodeMergeRepo(racing).mergeNode("canon", "dup", "标签-dup", NOW, "merge-1");

    expect(injected).toBe(true);
    const nodes = await inner.select<{ id: string }>("SELECT id FROM knowledge_nodes ORDER BY id");
    expect(nodes.map((row) => row.id)).toEqual(["canon", "x"]);
    const edges = await inner.select<{ source_id: string; target_id: string }>(
      "SELECT source_id, target_id FROM knowledge_edges",
    );
    expect(edges).toEqual([{ source_id: "canon", target_id: "x" }]);
    const merges = await inner.select("SELECT * FROM node_merges");
    expect(merges).toHaveLength(1);
  });

  it("keeps the more confident judgment and drops self-loops when edges collide", async () => {
    database = await openMigratedDatabase();
    await seedNodes(database.sql, [
      { id: "canon", parent: null },
      { id: "dup", parent: null },
      { id: "x", parent: null },
      { id: "y", parent: null },
    ]);
    // canon wins this one on a tie; dup wins the next one outright.
    await seedEdge(database.sql, { id: "e1", source_id: "canon", target_id: "x", confidence: 0.5 });
    await seedEdge(database.sql, { id: "e2", source_id: "dup", target_id: "x", confidence: 0.5 });
    await seedEdge(database.sql, { id: "e3", source_id: "canon", target_id: "y", confidence: 0.2 });
    await seedEdge(database.sql, { id: "e4", source_id: "dup", target_id: "y", confidence: 0.9 });
    // Would become canon -> canon.
    await seedEdge(database.sql, { id: "e5", source_id: "dup", target_id: "canon", confidence: 1 });

    await createNodeMergeRepo(database.sql).mergeNode("canon", "dup", "标签-dup", NOW, "merge-1");

    const edges = await database.sql.select<{ id: string; target_id: string; confidence: number }>(
      "SELECT id, target_id, confidence FROM knowledge_edges ORDER BY target_id",
    );
    // Ids do not move: the canonical's row absorbs the better judgment in place, exactly the
    // way buildKnowledgeEdgeUpsertStatement's ON CONFLICT ... DO UPDATE does.
    expect(edges).toEqual([
      { id: "e1", target_id: "x", confidence: 0.5 },
      { id: "e3", target_id: "y", confidence: 0.9 },
    ]);
  });
});
