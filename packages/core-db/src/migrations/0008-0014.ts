/**
 * Purpose: shipped migrations 0008-0014. Part of the append-only MIGRATIONS list
 * assembled in ./index.ts — see that file for the rules.
 * 0008-0014 — interest signals and mastery claims, goals, the ai_failures log, node
 * aliases, and the first two goal-ladder attempts (0013/0014, both later dropped).
 * Main exports: MIGRATIONS_0008_0014.
 */
import type { Migration } from "./migration";

export const MIGRATIONS_0008_0014: readonly Migration[] = [
  {
    // Two independent evidence streams for the mastery/interest split (spec 011, ADR-0009):
    // interest_signals is per-round LLM-observed psychological signal, mastery_claims is
    // user self-report. Neither table is read by the other's computation.
    id: "0008_interest_and_claims",
    statements: [
      `CREATE TABLE interest_signals (
        id TEXT PRIMARY KEY,
        node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        curiosity REAL NOT NULL,
        confusion REAL NOT NULL,
        boredom REAL NOT NULL,
        styles_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX idx_interest_signals_node ON interest_signals(node_id);`,
      `CREATE INDEX idx_interest_signals_created ON interest_signals(created_at);`,
      `CREATE TABLE mastery_claims (
        id TEXT PRIMARY KEY,
        node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
        level TEXT NOT NULL CHECK (level IN ('learned','familiar')),
        source TEXT NOT NULL CHECK (source IN ('self-report')),
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX idx_mastery_claims_node ON mastery_claims(node_id);`,
    ],
  },
  {
    // Learning goals set up in the experimental lab panel (spec 012): a title plus the node
    // ids it maps to (LLM-assisted, user-calibrated). gapAndPath() recomputes routes for a
    // goal from its node_ids_json on every read — nothing here is a stored plan.
    id: "0009_goals",
    statements: [
      `CREATE TABLE goals (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        node_ids_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,
      `CREATE INDEX idx_goals_updated ON goals(updated_at);`,
    ],
  },
  {
    // Developer-visible record of silent AI pipeline degradation (spec 014): every store's
    // extraction/judging catch writes one best-effort row here — never surfaced to the user,
    // only to the lab panel's "最近的静默失败" section.
    id: "0010_ai_failures",
    statements: [
      `CREATE TABLE ai_failures (
        id TEXT PRIMARY KEY,
        purpose TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX idx_ai_failures_created ON ai_failures(created_at);`,
    ],
  },
  {
    // Per-signal confidence (spec 014): how sure the extraction pass is about its own
    // psychological read, feeding aggregateInterest's shrinkage-weighted average. Existing
    // rows default to a mid confidence (0.6) so historical data keeps contributing sanely
    // without a real value to fall back on — old data is never migrated/reinterpreted.
    id: "0011_interest_signal_confidence",
    statements: [`ALTER TABLE interest_signals ADD COLUMN confidence REAL NOT NULL DEFAULT 0.6;`],
  },
  {
    // Node-dedup synonym gate (spec 015): one row per label the LLM judged identical to an
    // existing node. alias_label is the primary key so a re-judged label keeps its
    // first-recorded target (INSERT OR IGNORE) instead of drifting between nodes over time.
    id: "0012_node_aliases",
    statements: [
      `CREATE TABLE node_aliases (
        alias_label TEXT PRIMARY KEY,
        node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX idx_node_aliases_node ON node_aliases(node_id);`,
    ],
  },
  {
    // Pseudo-ranked ladder per goal (spec 016): the current generation's 5 reference figures,
    // plus the never-repeat backstop of every figure_desc ever shown for that goal. A figure's
    // row also carries the user's own milestone at the moment it was generated
    // (user_milestone_at_generation) so planLadderRefresh can later decide reuse vs
    // regenerate without a separate lookup. figure_desc's uniqueness within a goal is enforced
    // by ladder_shown_descriptions' own primary key, not by goal_ladders itself (a
    // reused/redisplayed row is expected to repeat its own figure_desc across recomputes of
    // the same generation until the next regeneration replaces the whole set).
    id: "0013_goal_ladders",
    statements: [
      `CREATE TABLE goal_ladders (
        id TEXT PRIMARY KEY,
        goal_id TEXT NOT NULL REFERENCES goals(id),
        figure_desc TEXT NOT NULL,
        figure_note TEXT NOT NULL,
        milestone INTEGER NOT NULL,
        position INTEGER NOT NULL,
        generation INTEGER NOT NULL,
        user_milestone_at_generation INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX idx_goal_ladders_goal ON goal_ladders(goal_id);`,
      // The never-repeat backstop (spec 016 #3): a plain INSERT (never OR IGNORE) so a real
      // figure_desc collision for the same goal raises loudly instead of silently reusing it.
      `CREATE TABLE ladder_shown_descriptions (
        goal_id TEXT NOT NULL REFERENCES goals(id),
        figure_desc TEXT NOT NULL,
        PRIMARY KEY (goal_id, figure_desc)
      );`,
    ],
  },
  {
    // Ranked-ladder v3 (spec 018): the board is rebuilt around actual rank numbers and
    // player-shaped personas (name/age/era/occupation/selfLine/chatProfile) instead of
    // milestone-tagged one-liners. goal_ladders and ladder_shown_descriptions are DROPPED
    // rather than migrated — a board is explicitly ephemeral (Leo's semantics: only the
    // current generation and its never-repeat history matter, never a historical record), and
    // there is no lossless way to turn a figure_desc one-liner into a structured identity.
    // This is a one-time reset of the anti-repeat history at this schema break; acceptable
    // because the backstop's only job is avoiding repeats going forward, not preserving the
    // past. The new backstop keys on `${name}|${era}` (ladder_shown_identities) instead of the
    // old free-text figure_desc.
    id: "0014_goal_ladders_v2",
    statements: [
      `DROP TABLE IF EXISTS ladder_shown_descriptions;`,
      `DROP TABLE IF EXISTS goal_ladders;`,
      `CREATE TABLE goal_ladders_v2 (
        id TEXT PRIMARY KEY,
        goal_id TEXT NOT NULL REFERENCES goals(id),
        name TEXT NOT NULL,
        age INTEGER NOT NULL,
        era TEXT NOT NULL,
        occupation TEXT NOT NULL,
        self_line TEXT NOT NULL,
        is_famous INTEGER NOT NULL,
        rank INTEGER NOT NULL,
        position INTEGER NOT NULL,
        generation INTEGER NOT NULL,
        user_rank_at_generation INTEGER NOT NULL,
        chat_profile_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX idx_goal_ladders_v2_goal ON goal_ladders_v2(goal_id);`,
      // The never-repeat backstop (spec 018 #3): a plain INSERT (never OR IGNORE) so a real
      // identity collision for the same goal raises loudly instead of silently reusing it.
      `CREATE TABLE ladder_shown_identities (
        goal_id TEXT NOT NULL REFERENCES goals(id),
        identity TEXT NOT NULL,
        PRIMARY KEY (goal_id, identity)
      );`,
    ],
  },
];
