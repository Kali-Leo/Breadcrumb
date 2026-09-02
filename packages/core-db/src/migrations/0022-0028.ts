/**
 * Purpose: shipped migrations 0022-0028. Part of the append-only MIGRATIONS list
 * assembled in ./index.ts — see that file for the rules.
 * 0022-0028 — practice scores, the last ladder table and the drop that ended the ladder
 * era, then the diglot weave tables, the mastery_claims rebuild and research tasks.
 * Main exports: MIGRATIONS_0022_0028.
 */
import type { Migration } from "./migration";

export const MIGRATIONS_0022_0028: readonly Migration[] = [
  {
    // Spec 029 leaf contract: the tri-state attestation was an invented middle form — the
    // user scores pure experience leaves directly (checkbox shortcut or 0–10). Old
    // tri-state rows convert (done→10, partial→5, not_yet→0); practice_attestations stays
    // behind unused rather than dropped (cheap, and keeps old builds from crashing).
    id: "0022_practice_scores",
    statements: [
      `CREATE TABLE practice_scores (
        item_id TEXT PRIMARY KEY,
        score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 10),
        scored_at TEXT NOT NULL
      );`,
      `INSERT INTO practice_scores (item_id, score, scored_at)
       SELECT item_id,
              CASE status WHEN 'done' THEN 10 WHEN 'partial' THEN 5 ELSE 0 END,
              attested_at
       FROM practice_attestations;`,
    ],
  },
  {
    // Spec 032: the goal's ten-rung flavor ladder is composed once by a strong model and
    // cached forever (no reroll — the board positions the learner, the learner does not
    // position themself). Titles are recomposed from it as the rung moves.
    id: "0023_goal_title_ladder",
    statements: [
      `CREATE TABLE goal_title_ladder (
        goal_id TEXT PRIMARY KEY,
        identity TEXT NOT NULL,
        rungs_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,
    ],
  },
  {
    // The ladder module was removed entirely by product decision (2026-08-12): its two
    // surviving tables are dropped, and nothing replaces them.
    id: "0024_drop_ladder_tables",
    statements: [
      `DROP TABLE IF EXISTS goal_ladder_board;`,
      `DROP TABLE IF EXISTS goal_title_ladder;`,
    ],
  },
  {
    // Spec 033 diglot weave: display-layer word replacement for language learning. States
    // hold one FSRS card per (lemma, pair); events are the append-only implicit-signal log
    // that drives scheduling; guesses keep the raw guess text (future confusion mining);
    // packs registers installed language packs. Chat storage is never touched (ADR-0019).
    id: "0025_diglot_weave",
    statements: [
      `CREATE TABLE diglot_word_states (
        lemma TEXT NOT NULL,
        pair TEXT NOT NULL,
        fsrs_json TEXT NOT NULL,
        due TEXT NOT NULL,
        introduced_at TEXT NOT NULL,
        last_event_at TEXT,
        PRIMARY KEY (lemma, pair)
      );`,
      `CREATE INDEX idx_diglot_states_due ON diglot_word_states(pair, due);`,
      `CREATE TABLE diglot_word_events (
        id TEXT PRIMARY KEY,
        lemma TEXT NOT NULL,
        pair TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN (
          'exposure','hover','audio',
          'guess_correct','guess_close','guess_wrong','guess_abandoned',
          'productive_use')),
        message_id TEXT,
        context_hash TEXT,
        latency_ms INTEGER,
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX idx_diglot_events_lemma ON diglot_word_events(pair, lemma, created_at);`,
      `CREATE TABLE diglot_word_guesses (
        id TEXT PRIMARY KEY,
        lemma TEXT NOT NULL,
        pair TEXT NOT NULL,
        guess TEXT NOT NULL,
        grade TEXT NOT NULL CHECK (grade IN ('correct','close','wrong')),
        context TEXT NOT NULL,
        latency_ms INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX idx_diglot_guesses_lemma ON diglot_word_guesses(pair, lemma);`,
      `CREATE TABLE diglot_language_packs (
        id TEXT PRIMARY KEY,
        source_lang TEXT NOT NULL,
        target_lang TEXT NOT NULL,
        version TEXT NOT NULL,
        meta_json TEXT NOT NULL,
        installed_at TEXT NOT NULL
      );`,
    ],
  },
  {
    // Spec 033 contextual diversity: one local-embedding vector per (lemma, pair, context)
    // a woven word appeared in. The scheduler discounts re-encounters in near-identical
    // contexts (novel contexts teach more). Rows are pruned to a small per-word cap.
    id: "0026_diglot_context_embeddings",
    statements: [
      `CREATE TABLE diglot_context_embeddings (
        lemma TEXT NOT NULL,
        pair TEXT NOT NULL,
        context_hash TEXT NOT NULL,
        vector_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (lemma, pair, context_hash)
      );`,
    ],
  },
  {
    // Vision/09 #2: teach-back explanation quality becomes mastery evidence. SQLite CHECK
    // constraints cannot be altered, so the claims table is rebuilt with the wider enums
    // (levels taught_principled/taught_surface, source teach-back). Data copied verbatim.
    id: "0027_teach_quality_claims",
    statements: [
      `ALTER TABLE mastery_claims RENAME TO mastery_claims_old;`,
      `CREATE TABLE mastery_claims (
        id TEXT PRIMARY KEY,
        node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
        level TEXT NOT NULL CHECK (level IN ('learned','familiar','taught_principled','taught_surface')),
        source TEXT NOT NULL CHECK (source IN ('self-report','teach-back')),
        created_at TEXT NOT NULL
      );`,
      `INSERT INTO mastery_claims SELECT * FROM mastery_claims_old;`,
      `DROP TABLE mastery_claims_old;`,
      `CREATE INDEX idx_mastery_claims_node ON mastery_claims(node_id);`,
    ],
  },
  {
    // Spec 036 research tasks: runs are recorded independently of results so that deleting
    // a result (user's right to withdraw) or toggling the feature never re-runs a task.
    // display_json/results_json are snapshotted so rendering survives task expiry.
    id: "0028_research_tasks",
    statements: [
      `CREATE TABLE research_task_runs (
        task_id TEXT PRIMARY KEY,
        ran_at TEXT NOT NULL
      );`,
      `CREATE TABLE research_results (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL UNIQUE,
        institution TEXT NOT NULL,
        title TEXT NOT NULL,
        purpose TEXT NOT NULL,
        ethics_note TEXT,
        display_json TEXT NOT NULL,
        results_json TEXT NOT NULL,
        computed_at TEXT NOT NULL
      );`,
    ],
  },
];
