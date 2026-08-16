/**
 * Purpose: SQL statements for the comparison tree module (spec 023) — evidence-backed
 * real-world profiles the user's own tree can be measured against, stored and replaced whole.
 * Profiles carry a category and items a kind (spec 026, curriculum vs occupation profiles).
 * The semantic crosswalk itself lives in canonicalRepositories.ts (spec 025).
 * Main exports: createComparisonRepo factory.
 */
import type { ComparisonProfileItemRow, ComparisonProfileRow, SqlClient } from "./types";

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
    /** Whole-replace: deletes the profile's previous row and items, then inserts the given
     * ones — all inside ONE transaction, so a crash never leaves a half-deleted or
     * half-inserted tree. No partial updates are
     * offered; a profile is always rewritten as a complete picture. INSERT OR REPLACE keeps the
     * write idempotent even when two callers race (e.g. dev StrictMode double effects). */
    async replaceProfile(
      profile: ComparisonProfileRow,
      items: readonly ComparisonProfileItemRow[],
    ): Promise<void> {
      await sql.executeTransaction([
        {
          sql: "DELETE FROM comparison_profile_items WHERE profile_id = ?",
          params: [profile.id],
        },
        { sql: "DELETE FROM comparison_profiles WHERE id = ?", params: [profile.id] },
        {
          sql: `INSERT OR REPLACE INTO comparison_profiles
             (id, title, origin, description, source_note, created_at, category)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          params: [
            profile.id,
            profile.title,
            profile.origin,
            profile.description,
            profile.source_note,
            profile.created_at,
            profile.category,
          ],
        },
        ...items.map((item) => ({
          sql: `INSERT OR REPLACE INTO comparison_profile_items
             (id, profile_id, parent_id, label, aliases_json, source_ref, position, concept_id, item_kind)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [
            item.id,
            item.profile_id,
            item.parent_id,
            item.label,
            item.aliases_json,
            item.source_ref,
            item.position,
            item.concept_id,
            item.item_kind,
          ],
        })),
      ]);
    },
    /** Deletes the profile row and its items in one transaction. */
    async deleteProfile(id: string): Promise<void> {
      await sql.executeTransaction([
        { sql: "DELETE FROM comparison_profile_items WHERE profile_id = ?", params: [id] },
        { sql: "DELETE FROM comparison_profiles WHERE id = ?", params: [id] },
      ]);
    },
  };
}
