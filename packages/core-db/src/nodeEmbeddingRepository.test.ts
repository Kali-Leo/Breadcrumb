/**
 * Purpose: unit tests for createNodeEmbeddingsRepo's getByNode against a fake SqlClient that
 * simulates node_embeddings' PRIMARY KEY(node_id) upsert semantics.
 */
import { describe, expect, it } from "vitest";
import type { NodeEmbeddingRow } from "./knowledgeTypes";
import { createNodeEmbeddingsRepo } from "./nodeEmbeddingRepository";
import { withSequentialTransactions } from "./transactionFallback";
import type { SqlClient } from "./types";

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
