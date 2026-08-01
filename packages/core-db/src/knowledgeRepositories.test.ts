/**
 * Purpose: unit tests for createKnowledgeEdgesRepo using a fake SqlClient that simulates
 * the table's real ON CONFLICT ... WHERE confidence-guarded upsert semantics.
 */
import { describe, expect, it } from "vitest";
import { createKnowledgeEdgesRepo } from "./knowledgeRepositories";
import type { KnowledgeEdgeRow, SqlClient } from "./types";

/** In-memory fake that reproduces the "keep higher confidence" upsert contract for one
 * table, keyed like the real UNIQUE(source_id, target_id, edge_type) constraint. */
function makeFakeEdgesSql() {
  const rows = new Map<string, KnowledgeEdgeRow>();
  const client: SqlClient = {
    select: <Row>(sql: string, params?: readonly unknown[]) => {
      if (sql.includes("WHERE source_id = ?") && sql.includes("edge_type = ?")) {
        const [nodeId, edgeType] = params as [string, string];
        return Promise.resolve(
          [...rows.values()].filter(
            (r) => r.source_id === nodeId && r.edge_type === edgeType,
          ) as Row[],
        );
      }
      if (sql.includes("WHERE target_id = ?") && sql.includes("edge_type = ?")) {
        const [nodeId, edgeType] = params as [string, string];
        return Promise.resolve(
          [...rows.values()].filter(
            (r) => r.target_id === nodeId && r.edge_type === edgeType,
          ) as Row[],
        );
      }
      return Promise.resolve([...rows.values()] as Row[]);
    },
    execute: (sql: string, params?: readonly unknown[]) => {
      if (sql.startsWith("INSERT INTO knowledge_edges")) {
        const [id, source_id, target_id, edge_type, weight, confidence, origin, created_at] =
          params as [
            string,
            string,
            string,
            "requires" | "helps",
            number,
            number,
            "llm" | "user",
            string,
          ];
        const key = `${source_id}::${target_id}::${edge_type}`;
        const existing = rows.get(key);
        if (existing === undefined || confidence > existing.confidence) {
          rows.set(key, {
            id,
            source_id,
            target_id,
            edge_type,
            weight,
            confidence,
            origin,
            created_at,
          });
        }
        return Promise.resolve();
      }
      if (sql.startsWith("DELETE FROM knowledge_edges")) {
        const [id] = params as [string];
        for (const [key, row] of rows) {
          if (row.id === id) rows.delete(key);
        }
        return Promise.resolve();
      }
      return Promise.resolve();
    },
  };
  return { client, rows };
}

const baseEdge: Omit<KnowledgeEdgeRow, "id" | "confidence"> = {
  source_id: "limits",
  target_id: "derivative",
  edge_type: "requires",
  weight: 1,
  origin: "llm",
  created_at: "2026-08-01T10:00:00Z",
};

describe("createKnowledgeEdgesRepo upsert", () => {
  it("inserts a brand new edge", async () => {
    const { client } = makeFakeEdgesSql();
    const repo = createKnowledgeEdgesRepo(client);
    await repo.upsert({ id: "e1", confidence: 0.7, ...baseEdge });
    expect(await repo.listAll()).toEqual([{ id: "e1", confidence: 0.7, ...baseEdge }]);
  });

  it("keeps the higher-confidence judgment when a lower-confidence one arrives later", async () => {
    const { client } = makeFakeEdgesSql();
    const repo = createKnowledgeEdgesRepo(client);
    await repo.upsert({ id: "e1", confidence: 0.9, ...baseEdge });
    await repo.upsert({
      id: "e2",
      confidence: 0.3,
      ...baseEdge,
      created_at: "2026-08-01T11:00:00Z",
    });
    const all = await repo.listAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe("e1");
    expect(all[0]?.confidence).toBe(0.9);
  });

  it("replaces the stored edge when a higher-confidence judgment arrives later", async () => {
    const { client } = makeFakeEdgesSql();
    const repo = createKnowledgeEdgesRepo(client);
    await repo.upsert({ id: "e1", confidence: 0.4, ...baseEdge });
    await repo.upsert({
      id: "e2",
      confidence: 0.95,
      ...baseEdge,
      created_at: "2026-08-01T11:00:00Z",
    });
    const all = await repo.listAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe("e2");
    expect(all[0]?.confidence).toBe(0.95);
  });

  it("keeps requires and helps edges between the same nodes separate", async () => {
    const { client } = makeFakeEdgesSql();
    const repo = createKnowledgeEdgesRepo(client);
    await repo.upsert({ id: "e1", confidence: 0.8, ...baseEdge });
    await repo.upsert({ id: "e2", confidence: 0.8, ...baseEdge, edge_type: "helps", weight: 0.5 });
    expect(await repo.listAll()).toHaveLength(2);
  });
});

describe("createKnowledgeEdgesRepo queries", () => {
  it("lists outgoing and incoming requires edges for a node", async () => {
    const { client } = makeFakeEdgesSql();
    const repo = createKnowledgeEdgesRepo(client);
    await repo.upsert({ id: "e1", confidence: 0.8, ...baseEdge });
    expect(await repo.listOutgoing("limits", "requires")).toHaveLength(1);
    expect(await repo.listIncoming("derivative", "requires")).toHaveLength(1);
    expect(await repo.listOutgoing("derivative", "requires")).toHaveLength(0);
  });

  it("removes an edge by id", async () => {
    const { client } = makeFakeEdgesSql();
    const repo = createKnowledgeEdgesRepo(client);
    await repo.upsert({ id: "e1", confidence: 0.8, ...baseEdge });
    await repo.remove("e1");
    expect(await repo.listAll()).toHaveLength(0);
  });
});
