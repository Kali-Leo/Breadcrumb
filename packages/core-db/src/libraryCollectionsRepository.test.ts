/**
 * Purpose: conversation links and collections against a real SQLite — the scoped searches
 * answer only from the linked documents, a deleted document leaves no link or membership
 * behind, and a deleted conversation takes its links with it.
 */
import { analyze, analyzedFields, matchExpression } from "@breadcrumb/core-text";
import { describe, expect, it } from "vitest";
import { createConversationsRepo } from "./conversationsRepository";
import { createLibraryCollectionsRepo, sameDocumentSet } from "./libraryCollectionsRepository";
import { createLibraryRepo, type PassageInsert } from "./libraryRepository";
import type { LibraryDocumentRow } from "./libraryTypes";
import { openMigratedDatabase } from "./realSqliteTestFixture";

const NOW = "2026-09-15T00:00:00.000Z";
const MODEL = "gte-multilingual-base-int8-384";

function document(id: string): LibraryDocumentRow {
  return {
    id,
    title: `书 ${id}`,
    origin: "upload",
    media_type: "markdown",
    language: "zh-CN",
    passage_count: 0,
    created_at: NOW,
  };
}

function passages(documentId: string, body: string): PassageInsert[] {
  const parent = `${documentId}-p`;
  const child = `${documentId}-c`;
  const base = { ordinal: 0, heading_path: "书", token_estimate: 5, created_at: NOW };
  const fields = analyzedFields(analyze(body));
  return [
    {
      passage: { ...base, id: parent, document_id: documentId, parent_id: null, body },
      ftsBody: "",
      ftsStems: "",
    },
    {
      passage: { ...base, id: child, document_id: documentId, parent_id: parent, body },
      ftsBody: fields.body,
      ftsStems: fields.stems,
    },
  ];
}

async function seeded() {
  const database = await openMigratedDatabase();
  const library = createLibraryRepo(database.sql);
  const collections = createLibraryCollectionsRepo(database.sql);
  const conversations = createConversationsRepo(database.sql);
  for (const id of ["d1", "d2", "d3"]) {
    await library.importDocument(document(id), passages(id, `复利的计算 ${id}`));
    await library.upsertPassageEmbedding({
      passage_id: `${id}-c`,
      model: MODEL,
      vector_json: "[1,0]",
      created_at: NOW,
    });
  }
  await conversations.create({
    id: "conv-1",
    title: "t",
    created_at: NOW,
    updated_at: NOW,
    kind: "chat",
  });
  return { database, library, collections, conversations };
}

describe("searching inside a conversation's linked documents", () => {
  it("answers from the scope only, and from nothing when the scope is empty", async () => {
    const { database, library } = await seeded();
    try {
      const match = matchExpression(analyze("复利"));
      const scoped = await library.searchKeyword(match, 10, ["d1", "d3"]);
      expect(scoped.map((hit) => hit.passage_id).sort()).toEqual(["d1-c", "d3-c"]);
      expect(await library.searchKeyword(match, 10, [])).toEqual([]);
      expect(await library.searchKeyword(match, 10)).toHaveLength(3);
      const vectors = await library.listPassageVectors(MODEL, ["d2"]);
      expect(vectors.map((row) => row.passage_id)).toEqual(["d2-c"]);
      expect(await library.listPassageVectors(MODEL, [])).toEqual([]);
    } finally {
      database.close();
    }
  });
});

describe("links and collections", () => {
  it("replaces a conversation's links as a whole and reads them back in order", async () => {
    const { database, collections } = await seeded();
    try {
      await collections.setLinks("conv-1", ["d2", "d1"], NOW);
      expect(await collections.listLinkedDocumentIds("conv-1")).toEqual(["d2", "d1"]);
      await collections.setLinks("conv-1", ["d3"], NOW);
      expect(await collections.listLinkedDocumentIds("conv-1")).toEqual(["d3"]);
    } finally {
      database.close();
    }
  });

  it("keeps a collection with its members, renames it, and unbinds on delete", async () => {
    const { database, collections, conversations } = await seeded();
    try {
      await collections.createCollection(
        { id: "col-1", name: "高等数学", created_at: NOW, updated_at: NOW },
        ["d1", "d2"],
      );
      await conversations.setLibraryCollection("conv-1", "col-1");
      expect((await conversations.getById("conv-1"))?.library_collection_id).toBe("col-1");
      let [collection] = await collections.listCollections();
      expect(collection?.documentIds).toEqual(["d1", "d2"]);
      await collections.setMembers("col-1", ["d2", "d3"], NOW);
      await collections.renameCollection("col-1", "线性代数", NOW);
      [collection] = await collections.listCollections();
      expect(collection).toMatchObject({ name: "线性代数", documentIds: ["d2", "d3"] });
      await collections.deleteCollection("col-1");
      expect(await collections.listCollections()).toEqual([]);
      expect((await conversations.getById("conv-1"))?.library_collection_id).toBeNull();
    } finally {
      database.close();
    }
  });

  it("compares document sets without caring about order", () => {
    expect(sameDocumentSet(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameDocumentSet(["a", "b"], ["a"])).toBe(false);
    expect(sameDocumentSet(["a", "a"], ["a", "b"])).toBe(false);
  });

  it("drops a deleted document from every link and membership, and an emptied collection", async () => {
    const { database, library, collections, conversations } = await seeded();
    try {
      await collections.setLinks("conv-1", ["d1", "d2"], NOW);
      await collections.createCollection(
        { id: "col-1", name: "两本", created_at: NOW, updated_at: NOW },
        ["d1", "d2"],
      );
      await collections.createCollection(
        { id: "col-2", name: "一本", created_at: NOW, updated_at: NOW },
        ["d1"],
      );
      await conversations.setLibraryCollection("conv-1", "col-2");
      await library.deleteDocument("d1");
      expect(await collections.listLinkedDocumentIds("conv-1")).toEqual(["d2"]);
      const remaining = await collections.listCollections();
      expect(remaining.map((c) => [c.id, c.documentIds])).toEqual([["col-1", ["d2"]]]);
      expect((await conversations.getById("conv-1"))?.library_collection_id).toBeNull();
      expect(await database.sql.select("PRAGMA foreign_key_check")).toEqual([]);
    } finally {
      database.close();
    }
  });

  it("takes the links with the conversation when it is deleted", async () => {
    const { database, collections, conversations } = await seeded();
    try {
      await collections.setLinks("conv-1", ["d1"], NOW);
      await conversations.remove("conv-1");
      expect(await collections.listLinkedDocumentIds("conv-1")).toEqual([]);
      expect(await database.sql.select("PRAGMA foreign_key_check")).toEqual([]);
    } finally {
      database.close();
    }
  });
});
