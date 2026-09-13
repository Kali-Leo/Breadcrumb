/**
 * Purpose: the library against a real SQLite — because everything interesting here is SQLite's
 * behaviour, not ours. That the FTS5 index is actually created with the tokenizer migration
 * 0056 names; that a Hindi word survives a round trip through it (the tokenizer bug this
 * product measured, reproduced against the real engine rather than against our own regex);
 * that a vector from another model counts as no vector; and that deleting a book leaves no
 * index row still answering for it.
 */
import { analyze, analyzedFields, ftsTokenChars, matchExpression } from "@breadcrumb/core-text";
import { describe, expect, it } from "vitest";
import { createLibraryRepo, type PassageInsert } from "./libraryRepository";
import type { LibraryDocumentRow, LibraryPassageRow } from "./libraryTypes";
import { ftsTokenCharsAt0056 } from "./migrations/ftsTokenize";
import { openMigratedDatabase } from "./realSqliteTestFixture";

const MODEL = "gte-multilingual-base-int8-384";

function document(id: string): LibraryDocumentRow {
  return {
    id,
    title: `书 ${id}`,
    origin: "upload",
    media_type: "markdown",
    language: "zh-CN",
    passage_count: 0,
    created_at: "2026-09-13T00:00:00.000Z",
  };
}

function passage(id: string, documentId: string, parentId: string | null, body: string) {
  const row: LibraryPassageRow = {
    id,
    document_id: documentId,
    parent_id: parentId,
    ordinal: 0,
    heading_path: "书 → 第一章",
    body,
    token_estimate: 10,
    created_at: "2026-09-13T00:00:00.000Z",
  };
  const fields = parentId === null ? { body: "", stems: "" } : analyzedFields(analyze(body));
  return { passage: row, ftsBody: fields.body, ftsStems: fields.stems } satisfies PassageInsert;
}

async function seeded(entries: readonly PassageInsert[]) {
  const database = await openMigratedDatabase();
  const repo = createLibraryRepo(database.sql);
  await repo.importDocument(document("d1"), entries);
  return { database, repo };
}

describe("the FTS5 index migration 0056 creates", () => {
  it("declares exactly the character set the query side keeps", () => {
    // Drift here is silent and total: the index and the query cut words in different places.
    expect(ftsTokenCharsAt0056()).toBe(ftsTokenChars());
  });

  it("needs no escaping inside the single-quoted SQL literal it is pasted into", () => {
    expect(ftsTokenCharsAt0056()).not.toContain("'");
    expect(ftsTokenCharsAt0056()).not.toContain("\\");
  });

  it("finds a Hindi word whole, which unicode61 on its own would not", async () => {
    const { database, repo } = await seeded([
      passage("p1", "d1", null, "父块"),
      passage("c1", "d1", "p1", "भारत में निर्मित उत्पाद"),
      passage("c2", "d1", "p1", "एक असंबंधित वाक्य"),
    ]);
    const hits = await repo.searchKeyword(matchExpression(analyze("निर्मित")), 10);
    expect(hits.map((hit) => hit.passage_id)).toEqual(["c1"]);
    database.close();
  });

  it("finds a Chinese phrase inside a longer run, through the bigrams", async () => {
    const { database, repo } = await seeded([
      passage("p1", "d1", null, "父块"),
      passage("c1", "d1", "p1", "清华大学计算机系"),
    ]);
    const hits = await repo.searchKeyword(matchExpression(analyze("大学")), 10);
    expect(hits.map((hit) => hit.passage_id)).toEqual(["c1"]);
    database.close();
  });

  it("ranks better matches first", async () => {
    const { database, repo } = await seeded([
      passage("p1", "d1", null, "父块"),
      passage("c1", "d1", "p1", "复利 复利 复利的计算"),
      passage("c2", "d1", "p1", "复利只出现一次，其余全是别的内容别的内容别的内容"),
    ]);
    const hits = await repo.searchKeyword(matchExpression(analyze("复利")), 10);
    expect(hits[0]?.passage_id).toBe("c1");
    database.close();
  });

  it("holds no row for a parent, because parents are read and never searched", async () => {
    const { database, repo } = await seeded([
      passage("p1", "d1", null, "父块正文 复利"),
      passage("c1", "d1", "p1", "子块正文 复利"),
    ]);
    const hits = await repo.searchKeyword(matchExpression(analyze("复利")), 10);
    expect(hits.map((hit) => hit.passage_id)).toEqual(["c1"]);
    database.close();
  });
});

describe("the embedding queue", () => {
  it("counts a vector from another model as no vector at all", async () => {
    const { database, repo } = await seeded([
      passage("p1", "d1", null, "父块"),
      passage("c1", "d1", "p1", "子块一"),
      passage("c2", "d1", "p1", "子块二"),
    ]);
    await repo.upsertPassageEmbedding({
      passage_id: "c1",
      model: "multilingual-e5-small-q8",
      vector_json: "[0.1,0.2]",
      created_at: "2026-09-13T00:00:00.000Z",
    });
    const queued = await repo.listPassagesMissingEmbedding(MODEL, 10);
    expect(queued.map((row) => row.id).sort()).toEqual(["c1", "c2"]);
    // And a parent is never queued: nothing embeds what nothing searches.
    expect(queued.some((row) => row.id === "p1")).toBe(false);
    database.close();
  });

  it("stops queueing a passage once this model has embedded it", async () => {
    const { database, repo } = await seeded([
      passage("p1", "d1", null, "父块"),
      passage("c1", "d1", "p1", "子块"),
    ]);
    await repo.upsertPassageEmbedding({
      passage_id: "c1",
      model: MODEL,
      vector_json: "[0.1,0.2]",
      created_at: "2026-09-13T00:00:00.000Z",
    });
    expect(await repo.listPassagesMissingEmbedding(MODEL, 10)).toEqual([]);
    expect(await repo.listPassageVectors(MODEL)).toHaveLength(1);
    expect(await repo.listPassageVectors("multilingual-e5-small-q8")).toEqual([]);
    expect(await repo.embeddingProgress(MODEL)).toEqual({ embedded: 1, total: 1 });
    database.close();
  });
});

describe("deleting a book", () => {
  it("leaves nothing behind that could still answer for it", async () => {
    const { database, repo } = await seeded([
      passage("p1", "d1", null, "父块"),
      passage("c1", "d1", "p1", "复利的计算"),
    ]);
    await repo.upsertPassageEmbedding({
      passage_id: "c1",
      model: MODEL,
      vector_json: "[0.1]",
      created_at: "2026-09-13T00:00:00.000Z",
    });
    await repo.deleteDocument("d1");
    expect(await repo.listDocuments()).toEqual([]);
    expect(await repo.getPassages(["c1"])).toEqual([]);
    expect(await repo.listPassageVectors(MODEL)).toEqual([]);
    expect(await repo.searchKeyword(matchExpression(analyze("复利")), 10)).toEqual([]);
    database.close();
  });
});
