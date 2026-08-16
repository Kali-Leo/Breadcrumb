/**
 * Purpose: SQL statements for the discovery feed's two tables (spec 051) — the card batches
 * shown on the feed and the silent impression/open/dwell/dislike signal stream over them.
 * Main exports: createDiscoveryRepo factory.
 */
import type { DiscoveryCardRow, DiscoveryEventRow, SqlClient } from "./types";

export function createDiscoveryRepo(sql: SqlClient) {
  return {
    /** One transaction for a whole generated batch — a crash never leaves a partial batch on
     * the feed (spec 051 §5, one LLM call = 12 cards). */
    async insertCards(rows: readonly DiscoveryCardRow[]): Promise<void> {
      await sql.executeTransaction(
        rows.map((row) => ({
          sql: `INSERT INTO discovery_cards
              (id, title, hook, topic_label, source, body_md, embedding_json, batch_id, created_at, opened_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [
            row.id,
            row.title,
            row.hook,
            row.topic_label,
            row.source,
            row.body_md,
            row.embedding_json,
            row.batch_id,
            row.created_at,
            row.opened_at,
          ],
        })),
      );
    },
    /** The feed's card grid, newest batch first — what the scroll-to-load-more view renders. */
    async listNewestCards(limit: number): Promise<DiscoveryCardRow[]> {
      return sql.select<DiscoveryCardRow>(
        "SELECT * FROM discovery_cards ORDER BY created_at DESC LIMIT ?",
        [limit],
      );
    },
    /** Lazy-fills a card's full article on first open (spec 051 §2) — cached permanently
     * afterward, so a second open never re-triggers the LLM call. */
    async setCardBody(id: string, bodyMd: string): Promise<void> {
      await sql.execute("UPDATE discovery_cards SET body_md = ? WHERE id = ?", [bodyMd, id]);
    },
    async setCardEmbedding(id: string, embeddingJson: string): Promise<void> {
      await sql.execute("UPDATE discovery_cards SET embedding_json = ? WHERE id = ?", [
        embeddingJson,
        id,
      ]);
    },
    /** Marks a card opened; never cleared afterward. */
    async markOpened(id: string, atIso: string): Promise<void> {
      await sql.execute("UPDATE discovery_cards SET opened_at = ? WHERE id = ?", [atIso, id]);
    },
    /** Most recent titles, newest first — the batch prompt's dedup avoid-list (spec 051 §5). */
    async listRecentTitles(limit: number): Promise<string[]> {
      const rows = await sql.select<{ title: string }>(
        "SELECT title FROM discovery_cards ORDER BY created_at DESC LIMIT ?",
        [limit],
      );
      return rows.map((row) => row.title);
    },
    async insertEvent(row: DiscoveryEventRow): Promise<void> {
      await sql.execute(
        `INSERT INTO discovery_events (id, card_id, topic_label, kind, value_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [row.id, row.card_id, row.topic_label, row.kind, row.value_ms, row.created_at],
      );
    },
    /** Events since a cutoff — raw material for a windowed interest-weight refold. */
    async listEventsSince(iso: string): Promise<DiscoveryEventRow[]> {
      return sql.select<DiscoveryEventRow>(
        "SELECT * FROM discovery_events WHERE created_at >= ? ORDER BY created_at ASC, id ASC",
        [iso],
      );
    },
    /** Every event ever recorded — raw material for a full interest-weight fold. */
    async listAllEvents(): Promise<DiscoveryEventRow[]> {
      return sql.select<DiscoveryEventRow>(
        "SELECT * FROM discovery_events ORDER BY created_at ASC, id ASC",
      );
    },
  };
}
