/**
 * Purpose: removes every row the demo seed ever writes (spec 035 T7b), plus anything the
 * running app derived from demo rows (embeddings, aliases, edges, anchors, signals,
 * factcheck runs) — a real dev database enforces foreign keys, so dependents go first.
 * Main exports: wipeDemoData.
 */
import type { SqlClient } from "@breadcrumb/core-db";
import { DEMO_PAIR } from "./shared";

/** Deletes children before parents. Safe on an empty/never-seeded database — every
 * statement is a no-op DELETE then. Covers rows written by the seed itself (`demo-` id)
 * AND rows the app later derived from demo nodes/conversations (any id, demo parent). */
export async function wipeDemoData(sql: SqlClient): Promise<void> {
  // App-derived dependents of demo knowledge nodes.
  await sql.execute("DELETE FROM node_embeddings WHERE node_id LIKE 'demo-%'");
  await sql.execute("DELETE FROM node_aliases WHERE node_id LIKE 'demo-%'");
  await sql.execute(
    "DELETE FROM knowledge_edges WHERE source_id LIKE 'demo-%' OR target_id LIKE 'demo-%'",
  );
  await sql.execute("DELETE FROM node_concept_anchors WHERE node_id LIKE 'demo-%'");
  await sql.execute("DELETE FROM interest_signals WHERE node_id LIKE 'demo-%'");
  // App-derived dependents of demo conversations/messages.
  await sql.execute(
    "DELETE FROM factcheck_claims WHERE run_id IN (SELECT id FROM factcheck_runs WHERE conversation_id LIKE 'demo-%')",
  );
  await sql.execute("DELETE FROM factcheck_runs WHERE conversation_id LIKE 'demo-%'");
  await sql.execute("DELETE FROM llm_calls WHERE conversation_id LIKE 'demo-%'");
  // Rows the seed writes directly (plus any app-added rows hanging off demo parents).
  await sql.execute(
    "DELETE FROM node_sightings WHERE id LIKE 'demo-%' OR node_id LIKE 'demo-%' OR conversation_id LIKE 'demo-%'",
  );
  await sql.execute("DELETE FROM mastery_claims WHERE id LIKE 'demo-%' OR node_id LIKE 'demo-%'");
  await sql.execute("DELETE FROM diglot_word_guesses WHERE id LIKE 'demo-%'");
  await sql.execute("DELETE FROM diglot_word_events WHERE id LIKE 'demo-%'");
  await sql.execute("DELETE FROM messages WHERE id LIKE 'demo-%' OR conversation_id LIKE 'demo-%'");
  await sql.execute("DELETE FROM conversations WHERE id LIKE 'demo-%'");
  // Demo nodes may parent each other; nulling parents first keeps single-statement DELETE
  // safe under immediate FK checks. (Non-demo children under a demo parent would be orphaned
  // to root — acceptable for a dev-only wipe, and the seed itself never creates that case.)
  await sql.execute("UPDATE knowledge_nodes SET parent_id = NULL WHERE parent_id LIKE 'demo-%'");
  await sql.execute("DELETE FROM knowledge_nodes WHERE id LIKE 'demo-%'");
  await sql.execute("DELETE FROM diglot_word_states WHERE pair = ?", [DEMO_PAIR]);
  await sql.execute("DELETE FROM diglot_language_packs WHERE id = ?", [DEMO_PAIR]);
}
