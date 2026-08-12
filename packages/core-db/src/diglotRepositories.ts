/**
 * Purpose: SQL statements for the diglot weave tables (spec 033) — FSRS word states,
 * the append-only signal event log, verbatim guesses, and installed language packs.
 * Main exports: createDiglotRepo factory.
 */
import type {
  DiglotLanguagePackRow,
  DiglotPairId,
  DiglotWordEventRow,
  DiglotWordGuessRow,
  DiglotWordStateRow,
} from "./diglotTypes";
import type { SqlClient } from "./types";

export function createDiglotRepo(sql: SqlClient) {
  return {
    /** Creates or overwrites the FSRS state of one (lemma, pair) — the scheduler owns the
     * card lifecycle and always writes the whole row back after a review. */
    async upsertState(row: DiglotWordStateRow): Promise<void> {
      await sql.execute(
        `INSERT OR REPLACE INTO diglot_word_states
           (lemma, pair, fsrs_json, due, introduced_at, last_event_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [row.lemma, row.pair, row.fsrs_json, row.due, row.introduced_at, row.last_event_at],
      );
    },
    /** Every tracked word of one pair — the scheduler's working set. */
    async listStates(pair: DiglotPairId): Promise<DiglotWordStateRow[]> {
      return sql.select<DiglotWordStateRow>(
        "SELECT * FROM diglot_word_states WHERE pair = ? ORDER BY lemma",
        [pair],
      );
    },
    /** Words due for a re-encounter, oldest due first — the review-debt queue. */
    async listDueStates(
      pair: DiglotPairId,
      nowIso: string,
      limit: number,
    ): Promise<DiglotWordStateRow[]> {
      return sql.select<DiglotWordStateRow>(
        `SELECT * FROM diglot_word_states WHERE pair = ? AND due <= ?
         ORDER BY due ASC LIMIT ?`,
        [pair, nowIso, limit],
      );
    },
    /** Appends one signal event; the log is append-only and never updated. */
    async insertEvent(row: DiglotWordEventRow): Promise<void> {
      await sql.execute(
        `INSERT INTO diglot_word_events
           (id, lemma, pair, kind, message_id, context_hash, latency_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.lemma,
          row.pair,
          row.kind,
          row.message_id,
          row.context_hash,
          row.latency_ms,
          row.created_at,
        ],
      );
    },
    /** Newest-first events of one word — the signal pipeline reads these to decide when
     * accumulated weak exposures convert into an FSRS review. */
    async listRecentEvents(
      pair: DiglotPairId,
      lemma: string,
      limit: number,
    ): Promise<DiglotWordEventRow[]> {
      return sql.select<DiglotWordEventRow>(
        `SELECT * FROM diglot_word_events WHERE pair = ? AND lemma = ?
         ORDER BY created_at DESC LIMIT ?`,
        [pair, lemma, limit],
      );
    },
    /** Appends one verbatim guess (append-only; raw text kept for confusion mining). */
    async insertGuess(row: DiglotWordGuessRow): Promise<void> {
      await sql.execute(
        `INSERT INTO diglot_word_guesses
           (id, lemma, pair, guess, grade, context, latency_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.lemma,
          row.pair,
          row.guess,
          row.grade,
          row.context,
          row.latency_ms,
          row.created_at,
        ],
      );
    },
    /** Every guess ever made for one pair, oldest first — the confusion-mining corpus. */
    async listGuesses(pair: DiglotPairId): Promise<DiglotWordGuessRow[]> {
      return sql.select<DiglotWordGuessRow>(
        "SELECT * FROM diglot_word_guesses WHERE pair = ? ORDER BY created_at ASC",
        [pair],
      );
    },
    /** Registers (or re-registers after update) one installed language pack. */
    async upsertPack(row: DiglotLanguagePackRow): Promise<void> {
      await sql.execute(
        `INSERT OR REPLACE INTO diglot_language_packs
           (id, source_lang, target_lang, version, meta_json, installed_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [row.id, row.source_lang, row.target_lang, row.version, row.meta_json, row.installed_at],
      );
    },
    /** Every installed pack — drives the settings page's pair picker. */
    async listPacks(): Promise<DiglotLanguagePackRow[]> {
      return sql.select<DiglotLanguagePackRow>("SELECT * FROM diglot_language_packs ORDER BY id");
    },
    /** Uninstalls a pack registration; word states are deliberately kept — re-installing
     * the pack must not lose learning history. */
    async deletePack(id: DiglotPairId): Promise<void> {
      await sql.execute("DELETE FROM diglot_language_packs WHERE id = ?", [id]);
    },
  };
}
