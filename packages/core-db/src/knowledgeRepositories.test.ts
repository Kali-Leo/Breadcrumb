/**
 * Purpose: unit tests for createKnowledgeEdgesRepo (ON CONFLICT ... WHERE confidence-guarded
 * upsert semantics) and createNodeAliasesRepo (insert-or-ignore alias lookup), both against
 * fake SqlClients that simulate the real table constraints.
 */
import { describe, expect, it } from "vitest";
import {
  createKnowledgeEdgesRepo,
  createNodeAliasesRepo,
  createNodeSightingsRepo,
} from "./knowledgeRepositories";
import { createNodeEmbeddingsRepo } from "./nodeEmbeddingRepository";
import { openMigratedDatabase } from "./realSqliteTestFixture";
import { withSequentialTransactions } from "./transactionFallback";
import type { KnowledgeEdgeRow, NodeAliasRow, NodeEmbeddingRow, SqlClient } from "./types";

/** In-memory fake that reproduces the "keep higher confidence" upsert contract for one
 * table, keyed like the real UNIQUE(source_id, target_id, edge_type) constraint. */
function makeFakeEdgesSql() {
  const rows = new Map<string, KnowledgeEdgeRow>();
  const client: SqlClient = withSequentialTransactions({
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
        const [
          id,
          source_id,
          target_id,
          edge_type,
          weight,
          confidence,
          origin,
          created_at,
          reasoning,
          source_message_id,
        ] = params as [
          string,
          string,
          string,
          "requires" | "helps",
          number,
          number,
          "llm" | "user",
          string,
          string | null,
          string | null,
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
            reasoning,
            source_message_id,
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
  });
  return { client, rows };
}

const baseEdge: Omit<KnowledgeEdgeRow, "id" | "confidence"> = {
  source_id: "limits",
  target_id: "derivative",
  edge_type: "requires",
  weight: 1,
  origin: "llm",
  created_at: "2026-08-01T10:00:00Z",
  reasoning: "求导的定义就写在极限上",
  source_message_id: "msg-1",
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

/** In-memory fake reproducing node_aliases' PRIMARY KEY(alias_label) + INSERT OR IGNORE
 * semantics: a second insert for an already-known label is silently dropped. */
function makeFakeAliasesSql() {
  const rows = new Map<string, NodeAliasRow>();
  const client: SqlClient = withSequentialTransactions({
    select: <Row>(sql: string, params?: readonly unknown[]) => {
      if (sql.includes("WHERE alias_label = ?")) {
        const [label] = params as [string];
        const row = rows.get(label);
        return Promise.resolve((row ? [row] : []) as Row[]);
      }
      return Promise.resolve(
        [...rows.values()].sort((a, b) => a.created_at.localeCompare(b.created_at)) as Row[],
      );
    },
    execute: (sql: string, params?: readonly unknown[]) => {
      if (sql.startsWith("INSERT OR IGNORE INTO node_aliases")) {
        const [alias_label, node_id, created_at] = params as [string, string, string];
        if (!rows.has(alias_label)) rows.set(alias_label, { alias_label, node_id, created_at });
      }
      return Promise.resolve();
    },
  });
  return { client, rows };
}

describe("createNodeAliasesRepo", () => {
  it("inserts an alias and finds it by label", async () => {
    const { client } = makeFakeAliasesSql();
    const repo = createNodeAliasesRepo(client);
    await repo.insert({ alias_label: "if缩进", node_id: "n1", created_at: "2026-08-01T10:00:00Z" });
    expect(await repo.findByLabel("if缩进")).toEqual({
      alias_label: "if缩进",
      node_id: "n1",
      created_at: "2026-08-01T10:00:00Z",
    });
  });

  it("returns null for a label with no alias", async () => {
    const { client } = makeFakeAliasesSql();
    const repo = createNodeAliasesRepo(client);
    expect(await repo.findByLabel("不存在")).toBeNull();
  });

  it("keeps the first-recorded target when a label is aliased again", async () => {
    const { client } = makeFakeAliasesSql();
    const repo = createNodeAliasesRepo(client);
    await repo.insert({ alias_label: "if缩进", node_id: "n1", created_at: "2026-08-01T10:00:00Z" });
    await repo.insert({ alias_label: "if缩进", node_id: "n2", created_at: "2026-08-01T11:00:00Z" });
    expect((await repo.findByLabel("if缩进"))?.node_id).toBe("n1");
  });

  it("lists every alias", async () => {
    const { client } = makeFakeAliasesSql();
    const repo = createNodeAliasesRepo(client);
    await repo.insert({ alias_label: "a", node_id: "n1", created_at: "2026-08-01T10:00:00Z" });
    await repo.insert({ alias_label: "b", node_id: "n2", created_at: "2026-08-01T11:00:00Z" });
    expect(await repo.listAll()).toHaveLength(2);
  });
});

/** In-memory fake for node_embeddings' PRIMARY KEY(node_id) upsert semantics. */
function makeFakeEmbeddingsSql() {
  const rows = new Map<string, NodeEmbeddingRow>();
  const client: SqlClient = withSequentialTransactions({
    select: <Row>(sql: string, params?: readonly unknown[]) => {
      if (sql.includes("WHERE node_id = ?")) {
        const [nodeId] = params as [string];
        const row = rows.get(nodeId);
        return Promise.resolve((row ? [row] : []) as Row[]);
      }
      return Promise.resolve([...rows.values()] as Row[]);
    },
    execute: (sql: string, params?: readonly unknown[]) => {
      if (sql.startsWith("INSERT INTO node_embeddings")) {
        const [node_id, model, vector_json, created_at] = params as [
          string,
          string,
          string,
          string,
        ];
        rows.set(node_id, { node_id, model, vector_json, created_at });
      }
      return Promise.resolve();
    },
  });
  return { client, rows };
}

describe("createNodeEmbeddingsRepo getByNode", () => {
  it("returns one node's embedding by id", async () => {
    const { client } = makeFakeEmbeddingsSql();
    const repo = createNodeEmbeddingsRepo(client);
    await repo.upsert({
      node_id: "n1",
      model: "multilingual-e5-small",
      vector_json: "[0.1,0.2]",
      created_at: "2026-08-01T10:00:00Z",
    });
    expect(await repo.getByNode("n1")).toEqual({
      node_id: "n1",
      model: "multilingual-e5-small",
      vector_json: "[0.1,0.2]",
      created_at: "2026-08-01T10:00:00Z",
    });
  });

  it("returns null when the node has no embedding", async () => {
    const { client } = makeFakeEmbeddingsSql();
    const repo = createNodeEmbeddingsRepo(client);
    expect(await repo.getByNode("missing")).toBeNull();
  });
});

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
