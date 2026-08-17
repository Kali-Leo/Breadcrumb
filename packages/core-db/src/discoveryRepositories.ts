/**
 * Purpose: SQL statements for the discovery feed's two tables (spec 051, spec 053) — the card
 * pool shown on the feed, now holding external content, and the silent signal stream over it.
 * Main exports: createDiscoveryRepo factory, DiscoveryCardInsert.
 */
import type { DiscoveryCardRow, DiscoveryEventRow, SqlClient } from "./types";

/** Spec 053's external-content columns are optional at insert time (they default to NULL), so
 * the retired 051 generation pipeline keeps inserting cards without naming them — same
 * precedent as conversations.create's companion_id. */
export type DiscoveryCardInsert = Omit<DiscoveryCardRow, ExternalContentColumn> &
  Partial<Pick<DiscoveryCardRow, ExternalContentColumn>>;

type ExternalContentColumn =
  | "source_id"
  | "kind"
  | "url"
  | "cover_url"
  | "author"
  | "published_at"
  | "saved_at"
  | "quality_score"
  | "upstream_signal"
  | "media_url";

export function createDiscoveryRepo(sql: SqlClient) {
  return {
    /** One transaction for a whole fetched batch — a crash never leaves a partial batch on
     * the feed (spec 051 §5; spec 053 §3 restocks the pool the same way). */
    async insertCards(rows: readonly DiscoveryCardInsert[]): Promise<void> {
      await sql.executeTransaction(
        rows.map((row) => ({
          sql: `INSERT INTO discovery_cards
              (id, title, hook, topic_label, source, body_md, embedding_json, batch_id, created_at, opened_at,
               source_id, kind, url, cover_url, author, published_at, saved_at, quality_score,
               upstream_signal, media_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            row.source_id ?? null,
            row.kind ?? null,
            row.url ?? null,
            row.cover_url ?? null,
            row.author ?? null,
            row.published_at ?? null,
            row.saved_at ?? null,
            row.quality_score ?? null,
            row.upstream_signal ?? null,
            row.media_url ?? null,
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
    /** Every pooled card id. The landing pass reads this to drop items it already holds
     * (spec 053 §3: refetching a feed must insert nothing and change nothing). Ids only —
     * the pool carries embeddings, and reading whole rows just to compare ids would move
     * megabytes on every restock. */
    async listCardIds(): Promise<string[]> {
      const rows = await sql.select<{ id: string }>("SELECT id FROM discovery_cards");
      return rows.map((row) => row.id);
    },
    /** Pooled cards the background embedding pass has not reached yet, newest first — spec
     * 053 §3's display-first, embed-later rule: a card is shown the moment it lands and its
     * vector only shapes later orderings. */
    async listCardsMissingEmbedding(limit: number): Promise<DiscoveryCardRow[]> {
      return sql.select<DiscoveryCardRow>(
        "SELECT * FROM discovery_cards WHERE embedding_json IS NULL ORDER BY created_at DESC LIMIT ?",
        [limit],
      );
    },
    /** Records the batch quality check's verdict (spec 053 §5). The score only ever demotes
     * a card in ranking; nothing is hidden because of it. */
    async setCardQualityScore(id: string, score: number): Promise<void> {
      await sql.execute("UPDATE discovery_cards SET quality_score = ? WHERE id = ?", [score, id]);
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
    /** Saves a card (an instant) or unsaves it (null) — spec 053 §6's 收藏 toggle. */
    async markSaved(id: string, savedAtIso: string | null): Promise<void> {
      await sql.execute("UPDATE discovery_cards SET saved_at = ? WHERE id = ?", [savedAtIso, id]);
    },
    /** The 收藏 list, most recently saved first. */
    async listSaved(): Promise<DiscoveryCardRow[]> {
      return sql.select<DiscoveryCardRow>(
        "SELECT * FROM discovery_cards WHERE saved_at IS NOT NULL ORDER BY saved_at DESC",
      );
    },
    /** How many pooled cards the user has never opened — spec 053 §3's low-water mark, which
     * triggers a background restock. Cards the user dismissed are excluded by the caller from
     * the ids it feeds the feed, exactly as it already filters dislikes from the event stream;
     * that consumed-id logic stays app-side. */
    async countUnseenPoolCards(): Promise<number> {
      const rows = await sql.select<{ total: number }>(
        "SELECT COUNT(*) AS total FROM discovery_cards WHERE opened_at IS NULL",
      );
      return rows[0]?.total ?? 0;
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
