/**
 * Purpose: SQL statements for the installed-pack side of the diglot weave (spec 033) —
 * diglot_language_packs (registration plus the pack file itself) and the cached context
 * embeddings used for the diversity discount. Word states, events and guesses live in
 * diglotWordRepositories.ts; createDiglotRepo composes the two halves.
 * Main exports: createDiglotPackRepo factory.
 */
import type { DiglotContextEmbeddingRow, DiglotLanguagePackRow, DiglotPairId } from "./diglotTypes";
import type { SqlClient } from "./types";

export function createDiglotPackRepo(sql: SqlClient) {
  return {
    /** Registers (or re-registers after update) one installed language pack, payload and all. */
    async upsertPack(row: DiglotLanguagePackRow): Promise<void> {
      await sql.execute(
        `INSERT OR REPLACE INTO diglot_language_packs
           (id, source_lang, target_lang, version, meta_json, installed_at, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.source_lang,
          row.target_lang,
          row.version,
          row.meta_json,
          row.installed_at,
          row.payload_json ?? null,
        ],
      );
    },
    /** Every installed pack, without the payloads — the picker needs the list, not megabytes
     * of dictionary text. */
    async listPacks(): Promise<DiglotLanguagePackRow[]> {
      return sql.select<DiglotLanguagePackRow>(
        `SELECT id, source_lang, target_lang, version, meta_json, installed_at
         FROM diglot_language_packs ORDER BY id`,
      );
    },
    /** The stored pack file for one pair, or null when that pair is not installed. */
    async getPackPayload(id: DiglotPairId): Promise<string | null> {
      const rows = await sql.select<{ payload_json: string | null }>(
        "SELECT payload_json FROM diglot_language_packs WHERE id = ?",
        [id],
      );
      return rows[0]?.payload_json ?? null;
    },
    /** Uninstalls a pack registration; word states are deliberately kept — re-installing
     * the pack must not lose learning history. */
    async deletePack(id: DiglotPairId): Promise<void> {
      await sql.execute("DELETE FROM diglot_language_packs WHERE id = ?", [id]);
    },
    /** Stores one context vector and prunes the word's oldest rows beyond a small cap —
     * a handful of distinct contexts is plenty for the diversity discount. */
    async upsertContextEmbedding(row: DiglotContextEmbeddingRow): Promise<void> {
      await sql.execute(
        `INSERT OR REPLACE INTO diglot_context_embeddings
           (lemma, pair, context_hash, vector_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [row.lemma, row.pair, row.context_hash, row.vector_json, row.created_at],
      );
      await sql.execute(
        `DELETE FROM diglot_context_embeddings
         WHERE lemma = ? AND pair = ? AND context_hash NOT IN (
           SELECT context_hash FROM diglot_context_embeddings
           WHERE lemma = ? AND pair = ? ORDER BY created_at DESC LIMIT 12)`,
        [row.lemma, row.pair, row.lemma, row.pair],
      );
    },
    /** Every stored context vector of a whole set of words, newest first — one round trip
     * for the whole message instead of one per candidate (the weave blocks painting). */
    async listContextEmbeddingsForLemmas(
      pair: DiglotPairId,
      lemmas: readonly string[],
    ): Promise<DiglotContextEmbeddingRow[]> {
      if (lemmas.length === 0) return [];
      const placeholders = lemmas.map(() => "?").join(", ");
      return sql.select<DiglotContextEmbeddingRow>(
        `SELECT * FROM diglot_context_embeddings WHERE pair = ? AND lemma IN (${placeholders})
         ORDER BY created_at DESC`,
        [pair, ...lemmas],
      );
    },
  };
}
