/**
 * Purpose: the two queries the background re-classification pass needs over `browsing_events`
 * (migration 0054) — find the rows an earlier, weaker classifier wrote, and write a better
 * answer back onto them.
 *
 * They live here rather than beside the insert/read repository in
 * packages/feature-browsing-interest/src/eventStore.ts for one reason: a row has no id column,
 * so it is addressed by SQLite's own `rowid`, and that is a fact about the storage engine
 * rather than about the interest model. Everything the panels read stays in the feature
 * package; only the upgrade pass reaches for a rowid.
 * Main exports: BrowsingEventUpgradeRow, createBrowsingEventUpgradesRepo.
 */
import type { SqlClient } from "./types";

/** A stored event as the upgrade pass sees it: its address, the text to re-embed, and the
 * name of whatever classified it last. */
export interface BrowsingEventUpgradeRow {
  readonly rowid: number;
  readonly title: string;
  readonly up: string;
  readonly classifier: string;
}

/** What a re-classification concluded, ready to write back. */
export interface BrowsingEventClassificationUpdate {
  readonly rowid: number;
  readonly topic: number | null;
  readonly emo: number | null;
  readonly valence: number | null;
  readonly classifier: string;
}

export function createBrowsingEventUpgradesRepo(sql: SqlClient) {
  return {
    /**
     * Rows whose stored classifier is not the embedding one, newest first — recent browsing is
     * what every panel window is about, so if the pass only ever gets through part of the
     * backlog it should be the part someone is looking at.
     *
     * The filter is deliberately `NOT LIKE '%embedding%'` and not a list of known names: the
     * point is to find rows a *future* better classifier has not touched, and a row written by
     * a name this build has never heard of should be offered to the pass, not skipped by it.
     */
    async listNeedingUpgrade(limit: number): Promise<BrowsingEventUpgradeRow[]> {
      return sql.select<BrowsingEventUpgradeRow>(
        `SELECT rowid, title, up, classifier FROM browsing_events
          WHERE classifier NOT LIKE '%embedding%'
          ORDER BY ts DESC LIMIT ?`,
        [limit],
      );
    },

    /** Writes a batch of re-classifications in one transaction: the pass is best-effort and
     * may be interrupted, and a row that keeps its old classifier name will simply be offered
     * again next time — but a row whose topic changed while its name did not would never be
     * revisited and never be right. */
    async applyClassifications(
      updates: readonly BrowsingEventClassificationUpdate[],
    ): Promise<void> {
      if (updates.length === 0) return;
      await sql.executeTransaction(
        updates.map((update) => ({
          sql: "UPDATE browsing_events SET topic = ?, emo = ?, valence = ?, classifier = ? WHERE rowid = ?",
          params: [update.topic, update.emo, update.valence, update.classifier, update.rowid],
        })),
      );
    },
  };
}
