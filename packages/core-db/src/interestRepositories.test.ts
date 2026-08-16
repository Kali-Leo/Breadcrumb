/**
 * Purpose: unit tests for createInterestSignalsRepo and createMasteryClaimsRepo using an
 * in-memory fake SqlClient — confirms the two tables never read each other's rows.
 */
import { describe, expect, it } from "vitest";
import { createInterestSignalsRepo, createMasteryClaimsRepo } from "./interestRepositories";
import { withSequentialTransactions } from "./transactionFallback";
import type { InterestSignalRow, MasteryClaimRow, SqlClient } from "./types";

/** In-memory fake keyed by table name inferred from the SQL text. */
function makeFakeSql() {
  const interestRows: InterestSignalRow[] = [];
  const claimRows: MasteryClaimRow[] = [];
  const client: SqlClient = withSequentialTransactions({
    select: <Row>(sql: string) => {
      if (sql.includes("FROM interest_signals")) return Promise.resolve(interestRows as Row[]);
      if (sql.includes("FROM mastery_claims")) return Promise.resolve(claimRows as Row[]);
      return Promise.resolve([] as Row[]);
    },
    execute: (sql: string, params?: readonly unknown[]) => {
      if (sql.startsWith("INSERT INTO interest_signals")) {
        const [
          id,
          node_id,
          conversation_id,
          curiosity,
          confusion,
          boredom,
          confidence,
          styles_json,
          created_at,
        ] = params as [string, string, string, number, number, number, number, string, string];
        interestRows.push({
          id,
          node_id,
          conversation_id,
          curiosity,
          confusion,
          boredom,
          confidence,
          styles_json,
          created_at,
        });
      }
      if (sql.startsWith("INSERT INTO mastery_claims")) {
        const [id, node_id, level, source, created_at] = params as [
          string,
          string,
          "learned" | "familiar",
          "self-report",
          string,
        ];
        claimRows.push({ id, node_id, level, source, created_at });
      }
      return Promise.resolve();
    },
  });
  return { client, interestRows, claimRows };
}

describe("createInterestSignalsRepo", () => {
  it("inserts and lists signals without touching claims", async () => {
    const { client, claimRows } = makeFakeSql();
    const repo = createInterestSignalsRepo(client);
    await repo.insert({
      id: "s1",
      node_id: "n1",
      conversation_id: "c1",
      curiosity: 0.8,
      confusion: 0.1,
      boredom: 0,
      confidence: 0.9,
      styles_json: JSON.stringify(["类比"]),
      created_at: "2026-08-01T10:00:00Z",
    });
    expect(await repo.listAll()).toHaveLength(1);
    expect(claimRows).toHaveLength(0);
  });
});

describe("createMasteryClaimsRepo", () => {
  it("inserts and lists claims without touching interest signals", async () => {
    const { client, interestRows } = makeFakeSql();
    const repo = createMasteryClaimsRepo(client);
    await repo.insert({
      id: "cl1",
      node_id: "n1",
      level: "learned",
      source: "self-report",
      created_at: "2026-08-01T10:00:00Z",
    });
    expect(await repo.listAll()).toEqual([
      {
        id: "cl1",
        node_id: "n1",
        level: "learned",
        source: "self-report",
        created_at: "2026-08-01T10:00:00Z",
      },
    ]);
    expect(interestRows).toHaveLength(0);
  });
});
