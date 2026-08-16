/**
 * Purpose: unit tests for the companion cast repositories (spec 037) using an in-memory fake
 * SqlClient — memory-stream round-trip and importance sums, proposal gate bookkeeping and
 * decline streaks, knowledge-state upsert, and conversations.create/findLatestByCompanion.
 */
import { describe, expect, it } from "vitest";
import {
  createCompanionKnowledgeStateRepo,
  createCompanionMemoriesRepo,
  createCompanionProposalsRepo,
} from "./companionRepositories";
import type {
  CompanionKnowledgeStateRow,
  CompanionMemoryRow,
  CompanionProposalRow,
} from "./companionTypes";
import { createConversationsRepo } from "./repositories";
import { withSequentialTransactions } from "./transactionFallback";
import type { ConversationRow, SqlClient } from "./types";

function makeFakeSql() {
  const conversations = new Map<string, ConversationRow>();
  const memories = new Map<string, CompanionMemoryRow>();
  const proposals = new Map<string, CompanionProposalRow>();
  const knowledgeStates = new Map<string, CompanionKnowledgeStateRow>();

  const client: SqlClient = withSequentialTransactions({
    select: <Row>(sql: string, params?: readonly unknown[]) => {
      const p = (params ?? []) as unknown[];
      if (sql.includes("FROM conversations WHERE companion_id = ? AND kind = ?")) {
        const rows = [...conversations.values()]
          .filter((row) => row.companion_id === p[0] && row.kind === p[1])
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
          .slice(0, 1);
        return Promise.resolve(rows as Row[]);
      }
      if (sql.includes("SUM(importance)")) {
        const total = [...memories.values()]
          .filter((row) => row.companion_id === p[0] && row.created_at >= String(p[1]))
          .reduce((sum, row) => sum + row.importance, 0);
        return Promise.resolve([{ total }] as Row[]);
      }
      if (sql.includes("FROM companion_memories WHERE companion_id = ?")) {
        const rows = [...memories.values()]
          .filter((row) => row.companion_id === p[0])
          .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
        return Promise.resolve(rows as Row[]);
      }
      if (sql.includes("COUNT(*) AS total FROM companion_proposals")) {
        const total = [...proposals.values()].filter(
          (row) => row.created_at >= String(p[0]),
        ).length;
        return Promise.resolve([{ total }] as Row[]);
      }
      if (
        sql.includes("FROM companion_proposals WHERE companion_id = ?") &&
        sql.includes("LIMIT 1")
      ) {
        const rows = [...proposals.values()]
          .filter((row) => row.companion_id === p[0])
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 1);
        return Promise.resolve(rows as Row[]);
      }
      if (sql === "SELECT * FROM companion_proposals ORDER BY created_at DESC LIMIT 1") {
        const rows = [...proposals.values()]
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 1);
        return Promise.resolve(rows as Row[]);
      }
      if (sql.includes("FROM companion_proposals WHERE companion_id = ?")) {
        const rows = [...proposals.values()]
          .filter((row) => row.companion_id === p[0])
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
        return Promise.resolve(rows as Row[]);
      }
      if (sql.includes("FROM companion_proposals WHERE created_at >= ?")) {
        const rows = [...proposals.values()]
          .filter((row) => row.created_at >= String(p[0]))
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
        return Promise.resolve(rows as Row[]);
      }
      if (sql.includes("FROM companion_knowledge_state WHERE conversation_id = ?")) {
        const row = knowledgeStates.get(String(p[0]));
        return Promise.resolve((row ? [row] : []) as Row[]);
      }
      throw new Error(`unexpected select: ${sql}`);
    },
    execute: (sql: string, params?: readonly unknown[]) => {
      const p = (params ?? []) as unknown[];
      if (sql.includes("INTO conversations")) {
        const [id, title, created_at, updated_at, kind, companion_id] = p as [
          string,
          string,
          string,
          string,
          ConversationRow["kind"],
          string | null,
        ];
        conversations.set(id, {
          id,
          title,
          created_at,
          updated_at,
          kind,
          companion_id,
          auto_title: null,
        });
      } else if (sql.includes("INTO companion_memories")) {
        const [id, companion_id, kind, content, importance, created_at, last_accessed_at] = p as [
          string,
          string,
          CompanionMemoryRow["kind"],
          string,
          number,
          string,
          string,
        ];
        memories.set(id, {
          id,
          companion_id,
          kind,
          content,
          importance,
          created_at,
          last_accessed_at,
        });
      } else if (sql.startsWith("UPDATE companion_memories SET last_accessed_at")) {
        const [isoNow, ...ids] = p as [string, ...string[]];
        for (const id of ids) {
          const row = memories.get(id);
          if (row) memories.set(id, { ...row, last_accessed_at: isoNow });
        }
      } else if (sql.includes("INTO companion_proposals")) {
        const [id, companion_id, node_id, topic, kind, status, created_at, resolved_at] = p as [
          string,
          string,
          string | null,
          string,
          CompanionProposalRow["kind"],
          CompanionProposalRow["status"],
          string,
          string | null,
        ];
        proposals.set(id, {
          id,
          companion_id,
          node_id,
          topic,
          kind,
          status,
          created_at,
          resolved_at,
        });
      } else if (sql.startsWith("UPDATE companion_proposals SET status")) {
        const [status, resolved_at, id] = p as [CompanionProposalRow["status"], string, string];
        const row = proposals.get(id);
        if (row) proposals.set(id, { ...row, status, resolved_at });
      } else if (sql.includes("INTO companion_knowledge_state")) {
        const [conversation_id, state_json, updated_at] = p as [string, string, string];
        knowledgeStates.set(conversation_id, { conversation_id, state_json, updated_at });
      } else {
        throw new Error(`unexpected execute: ${sql}`);
      }
      return Promise.resolve();
    },
  });
  return client;
}

describe("companion memories repo", () => {
  it("round-trips, lists oldest first and sums importance since a date", async () => {
    const repo = createCompanionMemoriesRepo(makeFakeSql());
    await repo.insert({
      id: "m1",
      companion_id: "pepper",
      kind: "observation",
      content: "struggled with recursion",
      importance: 4,
      created_at: "2026-08-01T00:00:00.000Z",
      last_accessed_at: "2026-08-01T00:00:00.000Z",
    });
    await repo.insert({
      id: "m2",
      companion_id: "pepper",
      kind: "observation",
      content: "asked a follow-up about base cases",
      importance: 6,
      created_at: "2026-08-05T00:00:00.000Z",
      last_accessed_at: "2026-08-05T00:00:00.000Z",
    });
    await repo.insert({
      id: "m3",
      companion_id: "shichimi",
      kind: "observation",
      content: "unrelated companion",
      importance: 9,
      created_at: "2026-08-05T00:00:00.000Z",
      last_accessed_at: "2026-08-05T00:00:00.000Z",
    });
    const listed = await repo.listByCompanion("pepper");
    expect(listed.map((row) => row.id)).toEqual(["m1", "m2"]);
    expect(await repo.sumImportanceSince("pepper", "2026-08-03T00:00:00.000Z")).toBe(6);
    expect(await repo.sumImportanceSince("pepper", "2026-01-01T00:00:00.000Z")).toBe(10);
  });

  it("advances last_accessed_at only for the touched ids", async () => {
    const repo = createCompanionMemoriesRepo(makeFakeSql());
    const inner = repo;
    await inner.insert({
      id: "m1",
      companion_id: "cumin",
      kind: "observation",
      content: "x",
      importance: 3,
      created_at: "2026-08-01T00:00:00.000Z",
      last_accessed_at: "2026-08-01T00:00:00.000Z",
    });
    await inner.insert({
      id: "m2",
      companion_id: "cumin",
      kind: "observation",
      content: "y",
      importance: 3,
      created_at: "2026-08-02T00:00:00.000Z",
      last_accessed_at: "2026-08-02T00:00:00.000Z",
    });
    await inner.touchLastAccessed(["m1"], "2026-08-10T00:00:00.000Z");
    const listed = await inner.listByCompanion("cumin");
    expect(listed.find((row) => row.id === "m1")?.last_accessed_at).toBe(
      "2026-08-10T00:00:00.000Z",
    );
    expect(listed.find((row) => row.id === "m2")?.last_accessed_at).toBe(
      "2026-08-02T00:00:00.000Z",
    );
  });

  it("touchLastAccessed is a no-op for an empty id list", async () => {
    const repo = createCompanionMemoriesRepo(makeFakeSql());
    await expect(repo.touchLastAccessed([], "2026-08-10T00:00:00.000Z")).resolves.toBeUndefined();
  });
});

describe("companion proposals repo", () => {
  const proposal = (overrides: Partial<CompanionProposalRow>): CompanionProposalRow => ({
    id: "p",
    companion_id: "shichimi",
    node_id: "node-1",
    topic: "递归",
    kind: "teach",
    status: "pending",
    created_at: "2026-08-01T00:00:00.000Z",
    resolved_at: null,
    ...overrides,
  });

  it("round-trips insert, resolve and listRecent/countCreatedSince", async () => {
    const repo = createCompanionProposalsRepo(makeFakeSql());
    await repo.insert(proposal({ id: "p1", created_at: "2026-08-01T00:00:00.000Z" }));
    await repo.insert(proposal({ id: "p2", created_at: "2026-08-10T00:00:00.000Z" }));
    await repo.resolve("p2", "accepted", "2026-08-10T01:00:00.000Z");

    const recent = await repo.listRecent("2026-08-05T00:00:00.000Z");
    expect(recent.map((row) => row.id)).toEqual(["p2"]);
    expect(recent[0]?.status).toBe("accepted");
    expect(recent[0]?.resolved_at).toBe("2026-08-10T01:00:00.000Z");
    expect(await repo.countCreatedSince("2026-08-01T00:00:00.000Z")).toBe(2);
    expect(await repo.countCreatedSince("2026-08-05T00:00:00.000Z")).toBe(1);
  });

  it("latestByStatus scopes to one companion or reads the global latest when omitted", async () => {
    const repo = createCompanionProposalsRepo(makeFakeSql());
    await repo.insert(
      proposal({ id: "p1", companion_id: "shichimi", created_at: "2026-08-01T00:00:00.000Z" }),
    );
    await repo.insert(
      proposal({ id: "p2", companion_id: "pepper", created_at: "2026-08-05T00:00:00.000Z" }),
    );
    expect((await repo.latestByStatus("shichimi"))?.id).toBe("p1");
    expect((await repo.latestByStatus())?.id).toBe("p2");
    expect(await repo.latestByStatus("cumin")).toBeNull();
  });

  it("consecutiveDeclineCount stops at the first non-declined proposal", async () => {
    const repo = createCompanionProposalsRepo(makeFakeSql());
    await repo.insert(
      proposal({ id: "p1", status: "accepted", created_at: "2026-08-01T00:00:00.000Z" }),
    );
    await repo.insert(
      proposal({ id: "p2", status: "declined", created_at: "2026-08-02T00:00:00.000Z" }),
    );
    await repo.insert(
      proposal({ id: "p3", status: "declined", created_at: "2026-08-03T00:00:00.000Z" }),
    );
    await repo.insert(
      proposal({ id: "p4", status: "declined", created_at: "2026-08-04T00:00:00.000Z" }),
    );
    expect(await repo.consecutiveDeclineCount("shichimi")).toBe(3);

    await repo.insert(
      proposal({ id: "p5", status: "accepted", created_at: "2026-08-05T00:00:00.000Z" }),
    );
    expect(await repo.consecutiveDeclineCount("shichimi")).toBe(0);
  });

  it("consecutiveDeclineCount is zero for a companion with no proposals", async () => {
    const repo = createCompanionProposalsRepo(makeFakeSql());
    expect(await repo.consecutiveDeclineCount("shichimi")).toBe(0);
  });
});

describe("companion knowledge state repo", () => {
  it("upserts and overwrites the single row per conversation", async () => {
    const repo = createCompanionKnowledgeStateRepo(makeFakeSql());
    expect(await repo.getByConversation("c1")).toBeNull();
    await repo.upsert("c1", '{"expectations":["base case"]}', "2026-08-01T00:00:00.000Z");
    expect((await repo.getByConversation("c1"))?.state_json).toBe('{"expectations":["base case"]}');
    await repo.upsert(
      "c1",
      '{"expectations":["base case","recursive case"]}',
      "2026-08-02T00:00:00.000Z",
    );
    const state = await repo.getByConversation("c1");
    expect(state?.state_json).toBe('{"expectations":["base case","recursive case"]}');
    expect(state?.updated_at).toBe("2026-08-02T00:00:00.000Z");
  });
});

describe("conversations repo companion support", () => {
  it("still creates a plain conversation without companion_id", async () => {
    const repo = createConversationsRepo(makeFakeSql());
    await repo.create({
      id: "c1",
      title: "chat",
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
      kind: "chat",
    });
    const found = await repo.findLatestByCompanion("shichimi", "companion");
    expect(found).toBeNull();
  });

  it("finds the latest companion conversation of one kind, scoped by companion and kind", async () => {
    const repo = createConversationsRepo(makeFakeSql());
    await repo.create({
      id: "c1",
      title: "old chat",
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
      kind: "companion",
      companion_id: "shichimi",
    });
    await repo.create({
      id: "c2",
      title: "new chat",
      created_at: "2026-08-05T00:00:00.000Z",
      updated_at: "2026-08-05T00:00:00.000Z",
      kind: "companion",
      companion_id: "shichimi",
    });
    await repo.create({
      id: "c3",
      title: "teach session",
      created_at: "2026-08-06T00:00:00.000Z",
      updated_at: "2026-08-06T00:00:00.000Z",
      kind: "teach",
      companion_id: "shichimi",
    });
    await repo.create({
      id: "c4",
      title: "other companion",
      created_at: "2026-08-07T00:00:00.000Z",
      updated_at: "2026-08-07T00:00:00.000Z",
      kind: "companion",
      companion_id: "pepper",
    });
    const found = await repo.findLatestByCompanion("shichimi", "companion");
    expect(found?.id).toBe("c2");
  });
});
