/**
 * Purpose: the reads the discovery feed's background passes work from (spec 053 §2/§3/§5) — what
 * the pool is still missing (a vector, a picture, a quality score), and the one question the cover
 * pass asks about a picture before it stores it. All of them look at the pool as it stands rather
 * than at one round's landings: a pass that could not run when a batch landed picks the backlog up
 * on its next turn.
 * Main exports: createDiscoveryBackgroundQueries.
 */
import type { DiscoveryCardRow, SqlClient } from "./types";

export function createDiscoveryBackgroundQueries(sql: SqlClient) {
  return {
    /** Pooled cards the background embedding pass has not reached yet, newest first — spec
     * 053 §3's display-first, embed-later rule: a card is shown the moment it lands and its
     * vector only shapes later orderings. */
    async listCardsMissingEmbedding(limit: number): Promise<DiscoveryCardRow[]> {
      return sql.select<DiscoveryCardRow>(
        "SELECT * FROM discovery_cards WHERE embedding_json IS NULL ORDER BY created_at DESC LIMIT ?",
        [limit],
      );
    },

    /** Pooled cards that landed with no picture but do carry an address, newest first — what
     * the background cover-enrichment pass works through (spec 053 §2). Which of them are worth
     * a request is the app's decision, not this table's. */
    async listCardsMissingCover(limit: number): Promise<DiscoveryCardRow[]> {
      return sql.select<DiscoveryCardRow>(
        `SELECT * FROM discovery_cards WHERE cover_url IS NULL AND url IS NOT NULL
           ORDER BY created_at DESC LIMIT ?`,
        [limit],
      );
    },

    /** Pooled cards the batch quality check has not rated yet, newest first (spec 053 §5). The
     * check needs an API key and a network, and neither is there on the first launch of a fresh
     * install, so the pass reads the pool's backlog instead of the round that just landed. */
    async listCardsMissingQualityScore(limit: number): Promise<DiscoveryCardRow[]> {
      return sql.select<DiscoveryCardRow>(
        "SELECT * FROM discovery_cards WHERE quality_score IS NULL ORDER BY created_at DESC LIMIT ?",
        [limit],
      );
    },

    /** How many pooled cards already carry this exact picture. One address repeated across a
     * site's cards is that site's logo served as every page's og:image, not a cover for any of
     * them (spec 053 §2), and the caller uses this to refuse it. */
    async countCardsWithCoverUrl(coverUrl: string): Promise<number> {
      const rows = await sql.select<{ total: number }>(
        "SELECT COUNT(*) AS total FROM discovery_cards WHERE cover_url = ?",
        [coverUrl],
      );
      return rows[0]?.total ?? 0;
    },
  };
}
