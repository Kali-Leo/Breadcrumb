/**
 * Purpose: unit tests for createPracticeRepo using an in-memory fake SqlClient — attestation
 * upsert+list round-trip and overwrite-on-same-item_id semantics (spec 026).
 */
import { describe, expect, it } from "vitest";
import { createPracticeRepo } from "./practiceRepositories";
import type { PracticeAttestationRow, SqlClient } from "./types";

function makeFakeSql() {
  const rows = new Map<string, PracticeAttestationRow>();
  const client: SqlClient = {
    select: <Row>(sql: string) => {
      if (sql.includes("FROM practice_attestations")) {
        return Promise.resolve([...rows.values()] as Row[]);
      }
      return Promise.resolve([] as Row[]);
    },
    execute: (sql: string, params?: readonly unknown[]) => {
      if (sql.startsWith("INSERT OR REPLACE INTO practice_attestations")) {
        const [item_id, status, attested_at] = params as [
          string,
          "done" | "partial" | "not_yet",
          string,
        ];
        rows.set(item_id, { item_id, status, attested_at });
      }
      return Promise.resolve();
    },
  };
  return { client, rows };
}

describe("createPracticeRepo", () => {
  it("round-trips an attestation through upsertAttestation/listAttestations", async () => {
    const { client } = makeFakeSql();
    const repo = createPracticeRepo(client);
    await repo.upsertAttestation({
      item_id: "item1",
      status: "done",
      attested_at: "2026-08-09T10:00:00.000Z",
    });

    const stored = await repo.listAttestations();
    expect(stored).toEqual([
      { item_id: "item1", status: "done", attested_at: "2026-08-09T10:00:00.000Z" },
    ]);
  });

  it("overwrites the previous status for the same item_id instead of accumulating rows", async () => {
    const { client } = makeFakeSql();
    const repo = createPracticeRepo(client);
    await repo.upsertAttestation({
      item_id: "item1",
      status: "done",
      attested_at: "2026-08-09T10:00:00.000Z",
    });
    await repo.upsertAttestation({
      item_id: "item1",
      status: "partial",
      attested_at: "2026-08-09T11:00:00.000Z",
    });

    const stored = await repo.listAttestations();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toEqual({
      item_id: "item1",
      status: "partial",
      attested_at: "2026-08-09T11:00:00.000Z",
    });
  });

  it("keeps distinct items separate", async () => {
    const { client } = makeFakeSql();
    const repo = createPracticeRepo(client);
    await repo.upsertAttestation({
      item_id: "item1",
      status: "done",
      attested_at: "2026-08-09T10:00:00.000Z",
    });
    await repo.upsertAttestation({
      item_id: "item2",
      status: "not_yet",
      attested_at: "2026-08-09T10:05:00.000Z",
    });

    const stored = await repo.listAttestations();
    expect(stored.map((row) => row.item_id).sort()).toEqual(["item1", "item2"]);
  });

  it("returns an empty list when nothing has been attested", async () => {
    const { client } = makeFakeSql();
    const repo = createPracticeRepo(client);
    expect(await repo.listAttestations()).toEqual([]);
  });
});
