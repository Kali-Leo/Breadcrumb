/**
 * Purpose: SQL statements for standalone feature side-tables — memory-palace place-name
 * overrides and daily trail summaries.
 * Main exports: mapPlaceNamesRepo, trailSummariesRepo factories.
 */
import type { MapPlaceNameRow, TrailSummaryRow } from "./featureTypes";
import type { SqlClient } from "./types";

export function createMapPlaceNamesRepo(sql: SqlClient) {
  return {
    /** Every override, for building the map's display names. */
    async listAll(): Promise<MapPlaceNameRow[]> {
      return sql.select<MapPlaceNameRow>("SELECT * FROM map_place_names");
    },
    /** User renames always win; an AI suggestion never overwrites a user name. */
    async upsert(row: MapPlaceNameRow): Promise<void> {
      await sql.execute(
        `INSERT INTO map_place_names (node_id, custom_label, source, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(node_id) DO UPDATE SET
           custom_label = excluded.custom_label,
           source = excluded.source,
           updated_at = excluded.updated_at
         WHERE NOT (map_place_names.source = 'user' AND excluded.source = 'ai')`,
        [row.node_id, row.custom_label, row.source, row.updated_at],
      );
    },
    async removeOverride(nodeId: string): Promise<void> {
      await sql.execute("DELETE FROM map_place_names WHERE node_id = ?", [nodeId]);
    },
  };
}

export function createTrailSummariesRepo(sql: SqlClient) {
  return {
    async get(date: string): Promise<TrailSummaryRow | null> {
      const rows = await sql.select<TrailSummaryRow>(
        "SELECT * FROM trail_summaries WHERE date = ?",
        [date],
      );
      return rows[0] ?? null;
    },
    /** Every summary dated on or after `fromDate` (a "YYYY-MM-DD" key), newest first — the
     * card's "last few days" list. */
    async listSince(fromDate: string): Promise<TrailSummaryRow[]> {
      return sql.select<TrailSummaryRow>(
        "SELECT * FROM trail_summaries WHERE date >= ? ORDER BY date DESC",
        [fromDate],
      );
    },
    async set(row: TrailSummaryRow): Promise<void> {
      await sql.execute(
        `INSERT INTO trail_summaries (date, content, created_at) VALUES (?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET content = excluded.content, created_at = excluded.created_at`,
        [row.date, row.content, row.created_at],
      );
    },
  };
}
