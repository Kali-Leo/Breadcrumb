/**
 * Purpose: the library's vector bookkeeping — which passages still need a vector, writing
 * one, and how far the background pass has got. Spread into createLibraryRepo, so callers
 * see one library repository; kept in its own file only for the size cap.
 *
 * Every read here is filtered by model: a stored vector from another model is not a weaker
 * match, it is an incomparable one, so it counts as absent everywhere.
 * Main exports: createLibraryEmbeddingQueue.
 */
import type {
  LibraryPassageEmbeddingRow,
  LibraryPassageRow,
  LibraryProgress,
} from "./libraryTypes";
import type { SqlClient } from "./types";

export function createLibraryEmbeddingQueue(sql: SqlClient) {
  return {
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
