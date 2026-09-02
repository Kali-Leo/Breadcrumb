/**
 * Purpose: unit tests for createNodeAliasesRepo (insert-or-ignore alias lookup) against a
 * fake SqlClient that simulates node_aliases' PRIMARY KEY(alias_label) constraint.
 */
import { describe, expect, it } from "vitest";
import { createNodeAliasesRepo } from "./aliasesRepository";
import type { NodeAliasRow } from "./knowledgeTypes";
import { withSequentialTransactions } from "./transactionFallback";
import type { SqlClient } from "./types";

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
