/**
 * Purpose: unit tests for createCanonicalRepo using an in-memory fake SqlClient — the
 * canonical-concept upsert round-trip/overwrite, and node<->concept anchor listing order and
 * overwrite-on-conflict semantics (spec 025).
 */
import { describe, expect, it } from "vitest";
import { createCanonicalRepo } from "./canonicalRepositories";
import { withSequentialTransactions } from "./transactionFallback";
import type { CanonicalConceptRow, NodeConceptAnchorRow, SqlClient } from "./types";

function makeFakeSql() {
  const conceptRows = new Map<string, CanonicalConceptRow>();
  const anchorRows = new Map<string, NodeConceptAnchorRow>();
  const client: SqlClient = withSequentialTransactions({
    select: <Row>(sql: string) => {
      if (sql.startsWith("SELECT * FROM canonical_concepts")) {
        const rows = [...conceptRows.values()].sort((a, b) => a.id.localeCompare(b.id));
        return Promise.resolve(rows as Row[]);
      }
      if (sql.startsWith("SELECT * FROM node_concept_anchors")) {
        const rows = [...anchorRows.values()].sort((a, b) =>
          a.anchored_at.localeCompare(b.anchored_at),
        );
        return Promise.resolve(rows as Row[]);
      }
      return Promise.resolve([] as Row[]);
    },
    execute: (sql: string, params?: readonly unknown[]) => {
      if (sql.startsWith("INSERT OR REPLACE INTO canonical_concepts")) {
        const [id, label, aliases_json, source_ref, created_at] = params as [
          string,
          string,
          string,
          string,
          string,
        ];
        conceptRows.set(id, { id, label, aliases_json, source_ref, created_at });
      } else if (sql.startsWith("INSERT OR REPLACE INTO node_concept_anchors")) {
        const [node_id, concept_id, verdict, confidence, method, reason, anchored_at] = params as [
          string,
          string,
          "same" | "different",
          "高" | "中" | "低",
          "alias" | "judge",
          string,
          string,
        ];
        anchorRows.set(`${node_id}:${concept_id}`, {
          node_id,
          concept_id,
          verdict,
          confidence,
          method,
          reason,
          anchored_at,
        });
      }
      return Promise.resolve();
    },
  });
  return { client, conceptRows, anchorRows };
}

function concept(overrides: Partial<CanonicalConceptRow> = {}): CanonicalConceptRow {
  return {
    id: "concept-data-structures",
    label: "数据结构",
    aliases_json: "[]",
    source_ref: "https://example.edu/cs-curriculum#ds",
    created_at: "2026-08-09T10:00:00.000Z",
    ...overrides,
  };
}

function anchor(overrides: Partial<NodeConceptAnchorRow> = {}): NodeConceptAnchorRow {
  return {
    node_id: "node1",
    concept_id: "concept-data-structures",
    verdict: "same",
    confidence: "高",
    method: "alias",
    reason: "标签完全一致",
    anchored_at: "2026-08-09T11:00:00.000Z",
    ...overrides,
  };
}

describe("createCanonicalRepo", () => {
  it("round-trips upsertConcepts/listConcepts and overwrites on re-upsert", async () => {
    const { client } = makeFakeSql();
    const repo = createCanonicalRepo(client);
    await repo.upsertConcepts([
      concept({ id: "concept-b", label: "操作系统" }),
      concept({ id: "concept-a", label: "数据结构" }),
    ]);

    const stored = await repo.listConcepts();
    expect(stored.map((row) => row.id)).toEqual(["concept-a", "concept-b"]);

    await repo.upsertConcepts([concept({ id: "concept-a", label: "数据结构（修订）" })]);
    const afterOverwrite = await repo.listConcepts();
    expect(afterOverwrite.find((row) => row.id === "concept-a")?.label).toBe("数据结构（修订）");
    expect(afterOverwrite).toHaveLength(2);
  });

  it("lists anchors ordered by anchored_at ascending", async () => {
    const { client } = makeFakeSql();
    const repo = createCanonicalRepo(client);
    await repo.upsertAnchors([
      anchor({ node_id: "node2", anchored_at: "2026-08-09T12:00:00.000Z" }),
      anchor({ node_id: "node1", anchored_at: "2026-08-09T11:00:00.000Z" }),
    ]);

    const stored = await repo.listAnchors();
    expect(stored.map((row) => row.node_id)).toEqual(["node1", "node2"]);
  });

  it("re-upserting the same (node_id, concept_id) pair overwrites instead of duplicating", async () => {
    const { client } = makeFakeSql();
    const repo = createCanonicalRepo(client);
    await repo.upsertAnchors([anchor({ verdict: "same", confidence: "高", method: "alias" })]);
    await repo.upsertAnchors([
      anchor({
        verdict: "different",
        confidence: "中",
        method: "judge",
        reason: "重新判定为不同概念",
      }),
    ]);

    const stored = await repo.listAnchors();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.verdict).toBe("different");
    expect(stored[0]?.confidence).toBe("中");
    expect(stored[0]?.method).toBe("judge");
    expect(stored[0]?.reason).toBe("重新判定为不同概念");
  });
});
