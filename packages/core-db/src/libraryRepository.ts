/**
 * Purpose: SQL for the library — writing an imported document and its passages atomically,
 * reading the keyword index and the stored vectors (the whole library, or only some of its
 * documents), and removing a document with everything that named it. The vector bookkeeping
 * is libraryEmbeddingQueue.ts, spread in here.
 *
 * Two shapes here are deliberate. Import writes through executeTransaction, because a
 * half-imported book (rows in library_passages, nothing in the FTS index) is a document that
 * looks present and cannot be found; either the whole book arrives or none of it does. And
 * every read of a vector is filtered by model: a stored vector from another model is not a
 * weaker match, it is an incomparable one, so it counts as absent everywhere.
 * Main exports: createLibraryRepo, PassageInsert.
 */
import { createLibraryEmbeddingQueue } from "./libraryEmbeddingQueue";
import type {
  KeywordHit,
  LibraryDocumentRow,
  LibraryPassageEmbeddingRow,
  LibraryPassageRow,
} from "./libraryTypes";
import type { SqlClient, SqlTransactionStatement } from "./types";

/** A passage plus the analyzed text that goes into the index beside it. */
export interface PassageInsert {
  passage: LibraryPassageRow;
  /** Analyzed tokens, space-joined. Empty for a parent: parents are read, never searched. */
  ftsBody: string;
  ftsStems: string;
}

const PASSAGE_SQL = `INSERT INTO library_passages
  (id, document_id, parent_id, ordinal, heading_path, body, token_estimate, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
const FTS_SQL = `INSERT INTO library_passage_fts (passage_id, body, stems) VALUES (?, ?, ?)`;

function insertStatements(entries: readonly PassageInsert[]): SqlTransactionStatement[] {
  const statements: SqlTransactionStatement[] = [];
  for (const { passage, ftsBody, ftsStems } of entries) {
    statements.push({
      sql: PASSAGE_SQL,
      params: [
        passage.id,
        passage.document_id,
        passage.parent_id,
        passage.ordinal,
        passage.heading_path,
        passage.body,
        passage.token_estimate,
        passage.created_at,
      ],
    });
    if (ftsBody !== "") {
      statements.push({ sql: FTS_SQL, params: [passage.id, ftsBody, ftsStems] });
    }
  }
  return statements;
}

/** `AND p.document_id IN (?, ?, …)` for a scope, or nothing for the whole library. */
function scopeClause(documentIds: readonly string[] | undefined): string {
  if (documentIds === undefined) return "";
  return ` AND p.document_id IN (${documentIds.map(() => "?").join(", ")})`;
}

export function createLibraryRepo(sql: SqlClient) {
  return {
    ...createLibraryEmbeddingQueue(sql),
    /** One document and all its passages, or nothing. */
    async importDocument(
      document: LibraryDocumentRow,
      passages: readonly PassageInsert[],
    ): Promise<void> {
      await sql.executeTransaction([
        {
          sql: `INSERT INTO library_documents
                (id, title, origin, media_type, language, passage_count, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          params: [
            document.id,
            document.title,
            document.origin,
            document.media_type,
            document.language,
            document.passage_count,
            document.created_at,
          ],
        },
        ...insertStatements(passages),
      ]);
    },

    async listDocuments(): Promise<LibraryDocumentRow[]> {
      return sql.select<LibraryDocumentRow>(
        "SELECT * FROM library_documents ORDER BY created_at DESC",
      );
    },

    /** The FTS index has no foreign key, so its rows are removed by hand and in the same
     * transaction — an orphaned index row would keep answering for a deleted book. The
     * conversation links and collection memberships that named the document go too, and a
     * collection left with no members is not a collection any more: it is removed, and any
     * conversation still pointing at it is unbound. */
    async deleteDocument(documentId: string): Promise<void> {
      await sql.executeTransaction([
        {
          sql: "DELETE FROM conversation_library_links WHERE document_id = ?",
          params: [documentId],
        },
        {
          sql: "DELETE FROM library_collection_members WHERE document_id = ?",
          params: [documentId],
        },
        {
          sql: `UPDATE conversations SET library_collection_id = NULL
                WHERE library_collection_id IS NOT NULL AND library_collection_id NOT IN
                (SELECT collection_id FROM library_collection_members)`,
        },
        {
          sql: `DELETE FROM library_collections WHERE id NOT IN
                (SELECT collection_id FROM library_collection_members)`,
        },
        {
          sql: `DELETE FROM library_passage_fts WHERE passage_id IN
                (SELECT id FROM library_passages WHERE document_id = ?)`,
          params: [documentId],
        },
        {
          sql: `DELETE FROM library_passage_embeddings WHERE passage_id IN
                (SELECT id FROM library_passages WHERE document_id = ?)`,
          params: [documentId],
        },
        { sql: "DELETE FROM library_passages WHERE document_id = ?", params: [documentId] },
        { sql: "DELETE FROM library_documents WHERE id = ?", params: [documentId] },
      ]);
    },

    /**
     * BM25 over the analyzed index. `match` comes from core-text's matchExpression, which
     * quotes every term, so nothing a learner types can be read as FTS5 syntax.
     * The stems field is weighted below the literal words: a stem match is real evidence, a
     * literal match is better evidence, and bm25()'s per-column weights are how FTS5 says so.
     * With `documentIds`, only passages of those documents are hits; an empty scope is no
     * scope to search, not the whole library.
     */
    async searchKeyword(
      match: string,
      limit: number,
      documentIds?: readonly string[],
    ): Promise<KeywordHit[]> {
      if (match === "" || documentIds?.length === 0) return [];
      return sql.select<KeywordHit>(
        `SELECT library_passage_fts.passage_id, bm25(library_passage_fts, 0.0, 1.0, 0.5) AS score
         FROM library_passage_fts JOIN library_passages p ON p.id = library_passage_fts.passage_id
         WHERE library_passage_fts MATCH ?${scopeClause(documentIds)}
         ORDER BY score LIMIT ?`,
        [match, ...(documentIds ?? []), limit],
      );
    },

    async getPassages(ids: readonly string[]): Promise<LibraryPassageRow[]> {
      if (ids.length === 0) return [];
      const placeholders = ids.map(() => "?").join(", ");
      return sql.select<LibraryPassageRow>(
        `SELECT * FROM library_passages WHERE id IN (${placeholders})`,
        ids,
      );
    },

    /** Every child passage's vector for the model in use — of the whole library, or of the
     * given documents only. Read whole because the search is a brute-force dot product, the
     * same as everywhere else in this product. */
    async listPassageVectors(
      model: string,
      documentIds?: readonly string[],
    ): Promise<LibraryPassageEmbeddingRow[]> {
      if (documentIds?.length === 0) return [];
      return sql.select<LibraryPassageEmbeddingRow>(
        `SELECT e.* FROM library_passage_embeddings e
         JOIN library_passages p ON p.id = e.passage_id
         WHERE e.model = ?${scopeClause(documentIds)}`,
        [model, ...(documentIds ?? [])],
      );
    },
  };
}
