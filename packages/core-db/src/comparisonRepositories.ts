/**
 * Purpose: SQL statements for the comparison tree module (spec 023) — evidence-backed
 * real-world profiles the user's own tree can be measured against, stored and replaced whole —
 * plus the semantic-alignment crosswalk (spec 024) between profile items and knowledge nodes.
 * Main exports: createComparisonRepo factory.
 */
import type {
  ComparisonAlignmentRow,
  ComparisonProfileItemRow,
  ComparisonProfileRow,
  SqlClient,
} from "./types";

export function createComparisonRepo(sql: SqlClient) {
  return {
    /** All profiles, oldest first. */
    async listProfiles(): Promise<ComparisonProfileRow[]> {
      return sql.select<ComparisonProfileRow>(
        "SELECT * FROM comparison_profiles ORDER BY created_at ASC, id ASC",
      );
    },
    async getProfile(id: string): Promise<ComparisonProfileRow | null> {
      const rows = await sql.select<ComparisonProfileRow>(
        "SELECT * FROM comparison_profiles WHERE id = ?",
        [id],
      );
      return rows[0] ?? null;
    },
    /** A profile's items in tree-display order. */
    async listItems(profileId: string): Promise<ComparisonProfileItemRow[]> {
      return sql.select<ComparisonProfileItemRow>(
        "SELECT * FROM comparison_profile_items WHERE profile_id = ? ORDER BY position ASC",
        [profileId],
      );
    },
    /** Whole-replace: deletes the profile's previous row, items, and alignment verdicts, then
     * inserts the given ones — same style as the old ladder repo's replaceFigures. No partial
     * updates are offered; a profile is always rewritten as a complete picture. Alignments are
     * cleared too because a new item set invalidates old item_id-keyed verdicts. INSERT OR
     * REPLACE keeps the write idempotent even when two callers race (e.g. dev StrictMode double
     * effects). */
    async replaceProfile(
      profile: ComparisonProfileRow,
      items: readonly ComparisonProfileItemRow[],
    ): Promise<void> {
      await sql.execute("DELETE FROM comparison_alignments WHERE profile_id = ?", [profile.id]);
      await sql.execute("DELETE FROM comparison_profile_items WHERE profile_id = ?", [profile.id]);
      await sql.execute("DELETE FROM comparison_profiles WHERE id = ?", [profile.id]);
      await sql.execute(
        `INSERT OR REPLACE INTO comparison_profiles (id, title, origin, description, source_note, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          profile.id,
          profile.title,
          profile.origin,
          profile.description,
          profile.source_note,
          profile.created_at,
        ],
      );
      for (const item of items) {
        await sql.execute(
          `INSERT OR REPLACE INTO comparison_profile_items
             (id, profile_id, parent_id, label, aliases_json, source_ref, position)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            item.id,
            item.profile_id,
            item.parent_id,
            item.label,
            item.aliases_json,
            item.source_ref,
            item.position,
          ],
        );
      }
    },
    /** Deletes the profile row, its items, and every alignment verdict judged against it. */
    async deleteProfile(id: string): Promise<void> {
      await sql.execute("DELETE FROM comparison_alignments WHERE profile_id = ?", [id]);
      await sql.execute("DELETE FROM comparison_profile_items WHERE profile_id = ?", [id]);
      await sql.execute("DELETE FROM comparison_profiles WHERE id = ?", [id]);
    },
    /** A profile's judged alignment verdicts, oldest judgment first. */
    async listAlignments(profileId: string): Promise<ComparisonAlignmentRow[]> {
      return sql.select<ComparisonAlignmentRow>(
        "SELECT * FROM comparison_alignments WHERE profile_id = ? ORDER BY judged_at ASC",
        [profileId],
      );
    },
    /** Persists crosswalk verdicts once and for all — INSERT OR REPLACE so a pair judged again
     * (should that ever happen) overwrites rather than duplicates, but callers should treat an
     * existing (item_id, node_id) row as a fact never worth re-asking the LLM about. */
    async upsertAlignments(rows: readonly ComparisonAlignmentRow[]): Promise<void> {
      for (const row of rows) {
        await sql.execute(
          `INSERT OR REPLACE INTO comparison_alignments
             (item_id, node_id, profile_id, verdict, confidence, reason, judged_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            row.item_id,
            row.node_id,
            row.profile_id,
            row.verdict,
            row.confidence,
            row.reason,
            row.judged_at,
          ],
        );
      }
    },
  };
}
