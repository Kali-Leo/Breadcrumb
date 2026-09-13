/**
 * Purpose: SQL for the library — writing an imported document and its passages atomically,
 * reading the keyword index, and keeping track of which passages still need a vector.
 *
 * Two shapes here are deliberate. Import writes through executeTransaction, because a
 * half-imported book (rows in library_passages, nothing in the FTS index) is a document that
 * looks present and cannot be found; either the whole book arrives or none of it does. And
 * every read of a vector is filtered by model: a stored vector from another model is not a
 * weaker match, it is an incomparable one, so it counts as absent everywhere.
 * Main exports: createLibraryRepo, PassageInsert.
 */
import type {
  KeywordHit,
  LibraryDocumentRow,
  LibraryPassageEmbeddingRow,
  LibraryPassageRow,
  LibraryProgress,
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

export function createLibraryRepo(sql: SqlClient) {
  return {
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
     * transaction — an orphaned index row would keep answering for a deleted book. */
    async deleteDocument(documentId: string): Promise<void> {
      await sql.executeTransaction([
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
     */
    async searchKeyword(match: string, limit: number): Promise<KeywordHit[]> {
      if (match === "") return [];
      return sql.select<KeywordHit>(
        `SELECT passage_id, bm25(library_passage_fts, 0.0, 1.0, 0.5) AS score
         FROM library_passage_fts WHERE library_passage_fts MATCH ?
         ORDER BY score LIMIT ?`,
        [match, limit],
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

    /** Every child passage's vector for the model in use. Read whole because the search is a
     * brute-force dot product, the same as everywhere else in this product. */
    async listPassageVectors(model: string): Promise<LibraryPassageEmbeddingRow[]> {
      return sql.select<LibraryPassageEmbeddingRow>(
        "SELECT * FROM library_passage_embeddings WHERE model = ?",
        [model],
      );
    },

    /**
     * The background queue: child passages with no usable vector. "No row" and "a row from
     * another model" are the same thing here, which is the whole reason the model column is
     * read at all.
     */
    async listPassagesMissingEmbedding(model: string, limit: number): Promise<LibraryPassageRow[]> {
      return sql.select<LibraryPassageRow>(
        `SELECT p.* FROM library_passages p
         LEFT JOIN library_passage_embeddings e ON e.passage_id = p.id AND e.model = ?
         WHERE p.parent_id IS NOT NULL AND e.passage_id IS NULL
         ORDER BY p.document_id, p.ordinal LIMIT ?`,
        [model, limit],
      );
    },

    async upsertPassageEmbedding(row: LibraryPassageEmbeddingRow): Promise<void> {
      await sql.execute(
        `INSERT INTO library_passage_embeddings (passage_id, model, vector_json, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(passage_id) DO UPDATE SET
           model = excluded.model, vector_json = excluded.vector_json,
           created_at = excluded.created_at`,
        [row.passage_id, row.model, row.vector_json, row.created_at],
      );
    },

    /** What the progress line reads. Children only: parents are never embedded. */
    async embeddingProgress(model: string): Promise<LibraryProgress> {
      const rows = await sql.select<LibraryProgress>(
        `SELECT
           (SELECT COUNT(*) FROM library_passage_embeddings WHERE model = ?) AS embedded,
           (SELECT COUNT(*) FROM library_passages WHERE parent_id IS NOT NULL) AS total`,
        [model],
      );
      return rows[0] ?? { embedded: 0, total: 0 };
    },
  };
}
