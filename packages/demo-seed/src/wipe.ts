/**
 * Purpose: removes every row the demo seed ever writes (spec 035 T7b), plus anything the
 * running app derived from demo rows (embeddings, aliases, edges, anchors, signals, place
 * names, focus sessions, factcheck runs) — as ONE transaction, because a wipe that stops
 * halfway is worse than one that never ran.
 * Main exports: wipeDemoData, WIPE_DEMO_REFERENCING_TABLES.
 */
import type { SqlClient, SqlTransactionStatement } from "@breadcrumb/core-db";
import { DEMO_PAIR } from "./shared";

/**
 * Every table the wipe must delete from because its rows point at a demo `knowledge_nodes`
 * or `conversations` row. Kept as data so wipe.test.ts can enumerate the LIVE schema
 * (pragma_foreign_key_list) and fail the moment a migration adds a referencing table without
 * a matching DELETE here — the same tripwire MERGE_REFERENCING_TABLES got after the
 * 2026-08-27 merge failure, and for the same reason: `map_place_names` was missing from this
 * list, so naming a single demo island on the map (the app's main screen) was enough to make
 * `DELETE FROM knowledge_nodes` fail with FOREIGN KEY constraint failed. Without a
 * transaction that left the database in a state it could not come back from — every demo
 * conversation, message and sighting gone, all 39 demo nodes still there — and since
 * insertDemoData starts by calling this, the demo could then never be installed or removed
 * again.
 *
 * `node_pair_verdicts` and `companion_proposals` carry node ids with NO declared foreign key,
 * so the pragma cannot find them; they are listed here anyway because leaving them pointing
 * at a deleted demo node is the same bug, just silent.
 */
export const WIPE_DEMO_REFERENCING_TABLES: readonly string[] = [
  // -> knowledge_nodes
  "knowledge_nodes", // parent_id
  "node_embeddings",
  "node_aliases",
  "knowledge_edges",
  "node_concept_anchors",
  "interest_signals",
  "mastery_claims",
  "map_place_names",
  "node_sightings",
  "node_pair_verdicts",
  "companion_proposals",
  // -> conversations
  "messages",
  "llm_calls",
  "factcheck_runs",
  "focus_sessions",
  "companion_knowledge_state",
];

/** Deletes children before parents. Safe on an empty/never-seeded database — every
 * statement is a no-op DELETE then. Covers rows written by the seed itself (`demo-` id)
 * AND rows the app later derived from demo nodes/conversations (any id, demo parent).
 *
 * One transaction, so a foreign key this list has not learned about yet rolls the whole
 * thing back and leaves a database that still works instead of a half-erased one. */
export async function wipeDemoData(sql: SqlClient): Promise<void> {
  const statements: SqlTransactionStatement[] = [
    // App-derived dependents of demo knowledge nodes.
    { sql: "DELETE FROM node_embeddings WHERE node_id LIKE 'demo-%'" },
    { sql: "DELETE FROM node_aliases WHERE node_id LIKE 'demo-%'" },
    {
      sql: "DELETE FROM knowledge_edges WHERE source_id LIKE 'demo-%' OR target_id LIKE 'demo-%'",
    },
    { sql: "DELETE FROM node_concept_anchors WHERE node_id LIKE 'demo-%'" },
    { sql: "DELETE FROM interest_signals WHERE node_id LIKE 'demo-%'" },
    // The custom name the map gives a place, keyed by node_id with a real foreign key — the
    // one that made the un-transactional wipe unrecoverable.
    { sql: "DELETE FROM map_place_names WHERE node_id LIKE 'demo-%'" },
    // No foreign key on either of these, so nothing would have complained; they would just
    // have been left pointing at nodes that no longer exist.
    {
      sql: "DELETE FROM node_pair_verdicts WHERE node_a_id LIKE 'demo-%' OR node_b_id LIKE 'demo-%'",
    },
    { sql: "DELETE FROM companion_proposals WHERE node_id LIKE 'demo-%'" },
    // App-derived dependents of demo conversations/messages.
    {
      sql: "DELETE FROM factcheck_claims WHERE run_id IN (SELECT id FROM factcheck_runs WHERE conversation_id LIKE 'demo-%')",
    },
    { sql: "DELETE FROM factcheck_runs WHERE conversation_id LIKE 'demo-%'" },
    { sql: "DELETE FROM llm_calls WHERE conversation_id LIKE 'demo-%'" },
    // A focus session started from a demo conversation, and its sites.
    {
      sql: "DELETE FROM focus_nodes WHERE session_id IN (SELECT id FROM focus_sessions WHERE conversation_id LIKE 'demo-%')",
    },
    { sql: "DELETE FROM focus_sessions WHERE conversation_id LIKE 'demo-%'" },
    { sql: "DELETE FROM companion_knowledge_state WHERE conversation_id LIKE 'demo-%'" },
    // Rows the seed writes directly (plus any app-added rows hanging off demo parents).
    {
      sql: "DELETE FROM node_sightings WHERE id LIKE 'demo-%' OR node_id LIKE 'demo-%' OR conversation_id LIKE 'demo-%'",
    },
    { sql: "DELETE FROM mastery_claims WHERE id LIKE 'demo-%' OR node_id LIKE 'demo-%'" },
    { sql: "DELETE FROM diglot_word_guesses WHERE id LIKE 'demo-%'" },
    { sql: "DELETE FROM diglot_word_events WHERE id LIKE 'demo-%'" },
    { sql: "DELETE FROM messages WHERE id LIKE 'demo-%' OR conversation_id LIKE 'demo-%'" },
    { sql: "DELETE FROM conversations WHERE id LIKE 'demo-%'" },
    // Demo nodes may parent each other; nulling parents first keeps single-statement DELETE
    // safe under immediate FK checks. (Non-demo children under a demo parent would be orphaned
    // to root — acceptable for a dev-only wipe, and the seed itself never creates that case.)
    { sql: "UPDATE knowledge_nodes SET parent_id = NULL WHERE parent_id LIKE 'demo-%'" },
    { sql: "DELETE FROM knowledge_nodes WHERE id LIKE 'demo-%'" },
    { sql: "DELETE FROM diglot_word_states WHERE pair = ?", params: [DEMO_PAIR] },
    { sql: "DELETE FROM diglot_language_packs WHERE id = ?", params: [DEMO_PAIR] },
  ];
  await sql.executeTransaction(statements);
}
