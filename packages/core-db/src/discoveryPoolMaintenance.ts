/**
 * Purpose: the discovery pool's housekeeping SQL (spec 053 §3 — 旧未看候选按时限淘汰, and a pool
 * that stays near its target size instead of growing for the life of the library), plus the
 * unseen-only read the feed ranks over. Anything the reader touched is theirs: a card they
 * opened or saved is never deleted here, and only cards they never reached ever expire.
 * Main exports: createDiscoveryPoolMaintenance.
 */
import type { DiscoveryCardRow, SqlClient } from "./types";

/** An untouched candidate: never opened, never saved. Everything this file deletes is one. */
const UNTOUCHED = "opened_at IS NULL AND saved_at IS NULL";

/** Newest-first by the instant the reader could have seen it published, falling back to the
 * instant it landed for the many feeds that publish no date at all. */
const BY_PUBLICATION = "COALESCE(published_at, created_at) DESC, id ASC";

export function createDiscoveryPoolMaintenance(sql: SqlClient) {
  return {
    /**
     * The cards the feed may still put on the grid, newest first. A card the reader already
     * opened is finished business — it stays in the library for 收藏 and history, and it never
     * comes back to the unseen grid, this session or after a relaunch.
     */
    async listUnseenPoolCards(limit: number): Promise<DiscoveryCardRow[]> {
      return sql.select<DiscoveryCardRow>(
        "SELECT * FROM discovery_cards WHERE opened_at IS NULL ORDER BY created_at DESC LIMIT ?",
        [limit],
      );
    },

    /** Drops untouched candidates that landed before `cutoffIso` — a month-old article nobody
     * reached is not going to be read now, and keeping it only slows every later restock. */
    async deleteUnseenCardsLandedBefore(cutoffIso: string): Promise<void> {
      await sql.execute(`DELETE FROM discovery_cards WHERE ${UNTOUCHED} AND created_at < ?`, [
        cutoffIso,
      ]);
    },

    /** Keeps the newest `limit` untouched candidates and drops the rest, oldest publication
     * first — the pool's hard ceiling, so a reader who never empties it still has a bounded
     * database and a bounded ranking pass. */
    async trimUnseenPoolTo(limit: number): Promise<void> {
      await sql.execute(
        `DELETE FROM discovery_cards WHERE id IN (
           SELECT id FROM discovery_cards WHERE ${UNTOUCHED}
           ORDER BY ${BY_PUBLICATION}
           LIMIT -1 OFFSET ?
         )`,
        [Math.max(0, Math.trunc(limit))],
      );
    },
  };
}
