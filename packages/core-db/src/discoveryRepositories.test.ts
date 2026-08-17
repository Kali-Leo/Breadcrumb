/**
 * Purpose: unit tests for createDiscoveryRepo using an in-memory fake SqlClient — confirms
 * card batch insert, lazy body/embedding fill, and the event stream all round-trip correctly.
 */
import { describe, expect, it } from "vitest";
import { createDiscoveryRepo } from "./discoveryRepositories";
import { withSequentialTransactions } from "./transactionFallback";
import type { DiscoveryCardRow, DiscoveryEventRow, SqlClient } from "./types";

/** In-memory fake keyed by table name inferred from the SQL text. */
function makeFakeSql() {
  const cardRows: DiscoveryCardRow[] = [];
  const eventRows: DiscoveryEventRow[] = [];
  const client: SqlClient = withSequentialTransactions({
    select: <Row>(sql: string, params?: readonly unknown[]) => {
      if (sql.includes("SELECT title FROM discovery_cards")) {
        const limit = params?.[0] as number;
        return Promise.resolve(
          [...cardRows]
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, limit)
            .map((row) => ({ title: row.title })) as Row[],
        );
      }
      if (sql.includes("SELECT id FROM discovery_cards")) {
        return Promise.resolve(cardRows.map((row) => ({ id: row.id })) as Row[]);
      }
      if (sql.includes("WHERE embedding_json IS NULL")) {
        const limit = params?.[0] as number;
        return Promise.resolve(
          [...cardRows]
            .filter((row) => row.embedding_json === null)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, limit) as Row[],
        );
      }
      if (sql.includes("FROM discovery_cards")) {
        const limit = params?.[0] as number;
        return Promise.resolve(
          [...cardRows]
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, limit) as Row[],
        );
      }
      if (sql.includes("FROM discovery_events")) {
        const sinceIso = sql.includes("WHERE created_at >=") ? (params?.[0] as string) : null;
        const rows = sinceIso ? eventRows.filter((row) => row.created_at >= sinceIso) : eventRows;
        return Promise.resolve(
          [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at)) as Row[],
        );
      }
      return Promise.resolve([] as Row[]);
    },
    execute: (sql: string, params?: readonly unknown[]) => {
      if (sql.startsWith("INSERT INTO discovery_cards")) {
        const values = params as readonly unknown[];
        cardRows.push({
          id: values[0] as string,
          title: values[1] as string,
          hook: values[2] as string,
          topic_label: values[3] as string,
          source: values[4] as DiscoveryCardRow["source"],
          body_md: values[5] as string | null,
          embedding_json: values[6] as string | null,
          batch_id: values[7] as string,
          created_at: values[8] as string,
          opened_at: values[9] as string | null,
          source_id: values[10] as string | null,
          kind: values[11] as DiscoveryCardRow["kind"],
          url: values[12] as string | null,
          cover_url: values[13] as string | null,
          author: values[14] as string | null,
          published_at: values[15] as string | null,
          saved_at: values[16] as string | null,
          quality_score: values[17] as number | null,
        });
      }
      if (sql.startsWith("UPDATE discovery_cards SET body_md")) {
        const [bodyMd, id] = params as [string, string];
        const row = cardRows.find((card) => card.id === id);
        if (row) row.body_md = bodyMd;
      }
      if (sql.startsWith("UPDATE discovery_cards SET embedding_json")) {
        const [embeddingJson, id] = params as [string, string];
        const row = cardRows.find((card) => card.id === id);
        if (row) row.embedding_json = embeddingJson;
      }
      if (sql.startsWith("UPDATE discovery_cards SET opened_at")) {
        const [openedAt, id] = params as [string, string];
        const row = cardRows.find((card) => card.id === id);
        if (row) row.opened_at = openedAt;
      }
      if (sql.startsWith("UPDATE discovery_cards SET quality_score")) {
        const [score, id] = params as [number, string];
        const row = cardRows.find((card) => card.id === id);
        if (row) row.quality_score = score;
      }
      if (sql.startsWith("UPDATE discovery_cards SET saved_at")) {
        const [savedAt, id] = params as [string | null, string];
        const row = cardRows.find((card) => card.id === id);
        if (row) row.saved_at = savedAt;
      }
      if (sql.startsWith("INSERT INTO discovery_events")) {
        const [id, card_id, topic_label, kind, value_ms, created_at] = params as [
          string,
          string,
          string,
          DiscoveryEventRow["kind"],
          number | null,
          string,
        ];
        eventRows.push({ id, card_id, topic_label, kind, value_ms, created_at });
      }
      return Promise.resolve();
    },
  });
  return { client, cardRows, eventRows };
}

function makeCard(overrides: Partial<DiscoveryCardRow> = {}): DiscoveryCardRow {
  return {
    id: "card-1",
    title: "闭包是什么",
    hook: "函数记住了它出生时的作用域。",
    topic_label: "编程语言",
    source: "starter",
    body_md: null,
    embedding_json: null,
    batch_id: "batch-1",
    created_at: "2026-08-16T10:00:00Z",
    opened_at: null,
    source_id: null,
    kind: null,
    url: null,
    cover_url: null,
    author: null,
    published_at: null,
    saved_at: null,
    quality_score: null,
    ...overrides,
  };
}

describe("createDiscoveryRepo cards", () => {
  it("inserts a batch in one transaction and lists newest first", async () => {
    const { client } = makeFakeSql();
    const repo = createDiscoveryRepo(client);
    await repo.insertCards([
      makeCard({ id: "c1", created_at: "2026-08-16T10:00:00Z" }),
      makeCard({ id: "c2", created_at: "2026-08-16T10:00:01Z" }),
    ]);
    const newest = await repo.listNewestCards(10);
    expect(newest.map((row) => row.id)).toEqual(["c2", "c1"]);
  });

  it("lazily fills body and embedding without touching other columns", async () => {
    const { client, cardRows } = makeFakeSql();
    const repo = createDiscoveryRepo(client);
    await repo.insertCards([makeCard({ id: "c1" })]);
    await repo.setCardBody("c1", "# 正文\n内容。");
    await repo.setCardEmbedding("c1", "[0.1,0.2]");
    expect(cardRows[0]?.body_md).toBe("# 正文\n内容。");
    expect(cardRows[0]?.embedding_json).toBe("[0.1,0.2]");
    expect(cardRows[0]?.title).toBe("闭包是什么");
  });

  it("marks a card opened", async () => {
    const { client, cardRows } = makeFakeSql();
    const repo = createDiscoveryRepo(client);
    await repo.insertCards([makeCard({ id: "c1" })]);
    expect(cardRows[0]?.opened_at).toBeNull();
    await repo.markOpened("c1", "2026-08-16T11:00:00Z");
    expect(cardRows[0]?.opened_at).toBe("2026-08-16T11:00:00Z");
  });

  it("carries the external-content columns through insert", async () => {
    const { client, cardRows } = makeFakeSql();
    const repo = createDiscoveryRepo(client);
    await repo.insertCards([
      makeCard({
        id: "c1",
        source_id: "hacker-news",
        kind: "discussion",
        url: "https://news.ycombinator.com/item?id=1",
        cover_url: null,
        author: "pg",
        published_at: "2026-08-15T08:00:00Z",
        quality_score: 0.75,
      }),
    ]);
    expect(cardRows[0]?.source_id).toBe("hacker-news");
    expect(cardRows[0]?.kind).toBe("discussion");
    expect(cardRows[0]?.url).toBe("https://news.ycombinator.com/item?id=1");
    expect(cardRows[0]?.author).toBe("pg");
    expect(cardRows[0]?.published_at).toBe("2026-08-15T08:00:00Z");
    expect(cardRows[0]?.quality_score).toBe(0.75);
  });

  it("leaves the external-content columns null when a caller omits them", async () => {
    const { client, cardRows } = makeFakeSql();
    const repo = createDiscoveryRepo(client);
    await repo.insertCards([
      {
        id: "c1",
        title: "闭包是什么",
        hook: "函数记住了它出生时的作用域。",
        topic_label: "编程语言",
        source: "starter",
        body_md: null,
        embedding_json: null,
        batch_id: "batch-1",
        created_at: "2026-08-16T10:00:00Z",
        opened_at: null,
      },
    ]);
    expect(cardRows[0]?.source_id).toBeNull();
    expect(cardRows[0]?.kind).toBeNull();
    expect(cardRows[0]?.quality_score).toBeNull();
  });

  it("saves and unsaves a card without touching opened_at", async () => {
    const { client, cardRows } = makeFakeSql();
    const repo = createDiscoveryRepo(client);
    await repo.insertCards([makeCard({ id: "c1" })]);
    await repo.markSaved("c1", "2026-08-17T09:00:00Z");
    expect(cardRows[0]?.saved_at).toBe("2026-08-17T09:00:00Z");
    expect(cardRows[0]?.opened_at).toBeNull();
    await repo.markSaved("c1", null);
    expect(cardRows[0]?.saved_at).toBeNull();
  });

  it("lists every card id for the landing pass's dedup set", async () => {
    const { client } = makeFakeSql();
    const repo = createDiscoveryRepo(client);
    await repo.insertCards([makeCard({ id: "c1" }), makeCard({ id: "c2" })]);
    expect((await repo.listCardIds()).sort()).toEqual(["c1", "c2"]);
  });

  it("lists only the cards still missing an embedding, newest first", async () => {
    const { client } = makeFakeSql();
    const repo = createDiscoveryRepo(client);
    await repo.insertCards([
      makeCard({ id: "c1", created_at: "2026-08-16T10:00:00Z" }),
      makeCard({ id: "c2", created_at: "2026-08-16T10:00:01Z" }),
    ]);
    await repo.setCardEmbedding("c2", "[0.1]");
    expect((await repo.listCardsMissingEmbedding(10)).map((row) => row.id)).toEqual(["c1"]);
  });

  it("writes a quality score without touching the rest of the row", async () => {
    const { client, cardRows } = makeFakeSql();
    const repo = createDiscoveryRepo(client);
    await repo.insertCards([makeCard({ id: "c1" })]);
    await repo.setCardQualityScore("c1", 0.2);
    expect(cardRows[0]?.quality_score).toBe(0.2);
    expect(cardRows[0]?.title).toBe("闭包是什么");
  });

  it("lists recent titles newest first, capped at the limit", async () => {
    const { client } = makeFakeSql();
    const repo = createDiscoveryRepo(client);
    await repo.insertCards([
      makeCard({ id: "c1", title: "标题一", created_at: "2026-08-16T10:00:00Z" }),
      makeCard({ id: "c2", title: "标题二", created_at: "2026-08-16T10:00:01Z" }),
      makeCard({ id: "c3", title: "标题三", created_at: "2026-08-16T10:00:02Z" }),
    ]);
    expect(await repo.listRecentTitles(2)).toEqual(["标题三", "标题二"]);
  });
});

describe("createDiscoveryRepo events", () => {
  it("inserts and lists all events in chronological order", async () => {
    const { client } = makeFakeSql();
    const repo = createDiscoveryRepo(client);
    await repo.insertEvent({
      id: "e2",
      card_id: "c1",
      topic_label: "编程语言",
      kind: "open",
      value_ms: null,
      created_at: "2026-08-16T10:00:01Z",
    });
    await repo.insertEvent({
      id: "e1",
      card_id: "c1",
      topic_label: "编程语言",
      kind: "impression",
      value_ms: null,
      created_at: "2026-08-16T10:00:00Z",
    });
    const all = await repo.listAllEvents();
    expect(all.map((row) => row.id)).toEqual(["e1", "e2"]);
  });

  it("filters events since a cutoff", async () => {
    const { client } = makeFakeSql();
    const repo = createDiscoveryRepo(client);
    await repo.insertEvent({
      id: "e1",
      card_id: "c1",
      topic_label: "编程语言",
      kind: "dwell",
      value_ms: 45000,
      created_at: "2026-08-01T00:00:00Z",
    });
    await repo.insertEvent({
      id: "e2",
      card_id: "c1",
      topic_label: "编程语言",
      kind: "dislike",
      value_ms: null,
      created_at: "2026-08-16T00:00:00Z",
    });
    const recent = await repo.listEventsSince("2026-08-10T00:00:00Z");
    expect(recent.map((row) => row.id)).toEqual(["e2"]);
  });
});
