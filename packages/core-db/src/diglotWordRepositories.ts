/**
 * Purpose: SQL statements for the per-word diglot weave tables (spec 033) — FSRS card states,
 * the append-only signal event log and verbatim guesses. Installed packs and context vectors
 * live in diglotPackRepositories.ts; createDiglotRepo composes the two halves.
 * Main exports: createDiglotWordRepo factory.
 */
import type {
  DiglotPairId,
  DiglotWordEventRow,
  DiglotWordGuessRow,
  DiglotWordStateRow,
} from "./diglotTypes";
import type { SqlClient } from "./types";

export function createDiglotWordRepo(sql: SqlClient) {
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
    /** Updates only the card fields of an existing state — introduced_at is immutable. */
    async updateStateCard(
      lemma: string,
      pair: DiglotPairId,
      fsrsJson: string,
      due: string,
      lastEventAt: string,
    ): Promise<void> {
      await sql.execute(
        `UPDATE diglot_word_states SET fsrs_json = ?, due = ?, last_event_at = ?
         WHERE lemma = ? AND pair = ?`,
        [fsrsJson, due, lastEventAt, lemma, pair],
      );
    },
    /** Words due for a re-encounter, oldest due first — the review-debt queue. Without a
     * limit this is the true due set: the debt throttle reads it, and a capped count silently
     * became "debt is at least N" once the vocabulary grew past the cap (audit 2026-08-28). */
    async listDueStates(
      pair: DiglotPairId,
      nowIso: string,
      limit?: number,
    ): Promise<DiglotWordStateRow[]> {
      if (limit === undefined) {
        return sql.select<DiglotWordStateRow>(
          "SELECT * FROM diglot_word_states WHERE pair = ? AND due <= ? ORDER BY due ASC",
          [pair, nowIso],
        );
      }
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
    /** One pair's events since an instant — the density loop's window (spec 033), which
     * needs a week of signals rather than the whole history. */
    async listEventsSince(pair: DiglotPairId, sinceIso: string): Promise<DiglotWordEventRow[]> {
      return sql.select<DiglotWordEventRow>(
        `SELECT * FROM diglot_word_events WHERE pair = ? AND created_at >= ?
         ORDER BY created_at ASC, id ASC`,
        [pair, sinceIso],
      );
    },
    /** Every event of one pair, oldest first — the FSRS fitting corpus (vision/09 #1). */
    async listAllEvents(pair: DiglotPairId): Promise<DiglotWordEventRow[]> {
      return sql.select<DiglotWordEventRow>(
        "SELECT * FROM diglot_word_events WHERE pair = ? ORDER BY created_at ASC, id ASC",
        [pair],
      );
    },
    /** Lemmas that have ever produced an explicit signal (guess or productive use) — the
     * guess policy asks signal-starved words more often. */
    async listLemmasWithExplicitSignal(pair: DiglotPairId): Promise<string[]> {
      const rows = await sql.select<{ lemma: string }>(
        `SELECT DISTINCT lemma FROM diglot_word_events WHERE pair = ? AND kind IN
           ('guess_correct','guess_close','guess_wrong','productive_use')`,
        [pair],
      );
      return rows.map((row) => row.lemma);
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
  };
}
