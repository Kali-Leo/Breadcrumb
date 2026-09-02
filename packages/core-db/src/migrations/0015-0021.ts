/**
 * Purpose: shipped migrations 0015-0021. Part of the append-only MIGRATIONS list
 * assembled in ./index.ts — see that file for the rules.
 * 0015-0021 — the rest of the goal-ladder archaeology (0015-0017 build and rebuild tables
 * that 0024 drops for good), then comparison profiles, alignments, canonical anchors and
 * occupation practice.
 * Main exports: MIGRATIONS_0015_0021.
 */
import type { Migration } from "./migration";

export const MIGRATIONS_0015_0021: readonly Migration[] = [
  {
    // Ranked-ladder v4 (spec 020, Leo's final form): the rank number becomes a pure incentive
    // scalar and the board a cast of deceased famous people regenerated on a randomized
    // schedule. Leo explicitly withdrew all record-keeping ("排行榜本来就会变，根本不需要保存
    // 任何记录"), so the never-repeat identity backstop and the reuse-anchor columns are
    // DROPPED, not migrated. The only persisted state is the current board (goal_ladder_figures,
    // replaced whole on refresh) and one state row per goal (goal_ladder_state).
    id: "0015_goal_ladder_v4",
    statements: [
      `DROP TABLE IF EXISTS ladder_shown_identities;`,
      `DROP TABLE IF EXISTS goal_ladders_v2;`,
      `CREATE TABLE goal_ladder_figures (
        id TEXT PRIMARY KEY,
        goal_id TEXT NOT NULL REFERENCES goals(id),
        name TEXT NOT NULL,
        age INTEGER NOT NULL,
        era TEXT NOT NULL,
        occupation TEXT NOT NULL,
        self_line TEXT NOT NULL,
        rank INTEGER NOT NULL,
        position INTEGER NOT NULL,
        generation INTEGER NOT NULL,
        chat_profile_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX idx_goal_ladder_figures_goal ON goal_ladder_figures(goal_id);`,
      `CREATE TABLE goal_ladder_state (
        goal_id TEXT PRIMARY KEY REFERENCES goals(id),
        last_shown_rank INTEGER,
        last_view_fuel REAL,
        next_refresh_at TEXT NOT NULL,
        generation INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );`,
    ],
  },
  {
    // Ranked-ladder v5 (spec 021): Leo withdrew the pseudo-people design entirely — no board
    // of generated figures, no refresh cadence, only the learner's own title derived from the
    // internal rank scalar. The figures table (including the spec 019 friend-chat foundation
    // chat_profile_json) is DROPPED, and goal_ladder_state loses its board-lifecycle columns
    // (next_refresh_at, generation) while last_shown_rank/last_view_fuel migrate losslessly —
    // the never-worsen/bounded-slip rank history survives the redesign.
    id: "0016_goal_ladder_self_title",
    statements: [
      `DROP TABLE IF EXISTS goal_ladder_figures;`,
      `CREATE TABLE goal_ladder_state_v2 (
        goal_id TEXT PRIMARY KEY REFERENCES goals(id),
        last_shown_rank INTEGER NOT NULL,
        last_view_fuel REAL NOT NULL,
        updated_at TEXT NOT NULL
      );`,
      `INSERT INTO goal_ladder_state_v2 (goal_id, last_shown_rank, last_view_fuel, updated_at)
        SELECT goal_id, last_shown_rank, last_view_fuel, updated_at FROM goal_ladder_state
        WHERE last_shown_rank IS NOT NULL AND last_view_fuel IS NOT NULL;`,
      `DROP TABLE goal_ladder_state;`,
      `ALTER TABLE goal_ladder_state_v2 RENAME TO goal_ladder_state;`,
    ],
  },
  {
    // Ranked-ladder v6 (spec 022, Leo's correction): the ladder is a real-time assessment
    // system merely DISPLAYED as a leaderboard — it must carry no mechanism at all. The v5
    // rank-scalar state (fuel/never-worsen machinery) is dropped without migration; the only
    // persisted thing is the current three-title board (the learner's own AI summary flanked
    // by slightly-ahead/slightly-behind states) and its cache expiry.
    id: "0017_goal_ladder_assessment_board",
    statements: [
      `DROP TABLE IF EXISTS goal_ladder_state;`,
      `CREATE TABLE goal_ladder_board (
        goal_id TEXT PRIMARY KEY REFERENCES goals(id),
        above_title TEXT NOT NULL,
        self_title TEXT NOT NULL,
        below_title TEXT NOT NULL,
        next_refresh_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,
    ],
  },
  {
    // Comparison tree (spec 023): a standalone module, unrelated to the ladder/knowledge tree —
    // the user's own tree compared against an evidence-backed real-world profile (e.g. a
    // historical curriculum, a professional skill tree). AI-invented content is forbidden here,
    // so every item row carries a non-empty source_ref pointing at where it came from.
    id: "0018_comparison_profiles",
    statements: [
      `CREATE TABLE comparison_profiles (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        origin TEXT NOT NULL,
        description TEXT NOT NULL,
        source_note TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,
      `CREATE TABLE comparison_profile_items (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL REFERENCES comparison_profiles(id),
        parent_id TEXT,
        label TEXT NOT NULL,
        aliases_json TEXT NOT NULL,
        source_ref TEXT NOT NULL,
        position INTEGER NOT NULL
      );`,
      `CREATE INDEX idx_comparison_profile_items_profile ON comparison_profile_items(profile_id);`,
    ],
  },
  {
    // Comparison tree semantic-alignment crosswalk (spec 024): an LLM-judged verdict on
    // whether one profile item and one knowledge node denote the same concept, persisted once
    // and reused forever. Both 'same' AND 'different' verdicts are stored — the point is that a
    // pair is never re-judged, not just that matches are remembered.
    id: "0019_comparison_alignments",
    statements: [
      `CREATE TABLE comparison_alignments (
        item_id TEXT NOT NULL REFERENCES comparison_profile_items(id),
        node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
        profile_id TEXT NOT NULL REFERENCES comparison_profiles(id),
        verdict TEXT NOT NULL CHECK (verdict IN ('same','different')),
        confidence TEXT NOT NULL CHECK (confidence IN ('高','中','低')),
        reason TEXT NOT NULL,
        judged_at TEXT NOT NULL,
        PRIMARY KEY (item_id, node_id)
      );`,
      `CREATE INDEX idx_comparison_alignments_profile ON comparison_alignments(profile_id);`,
    ],
  },
  {
    // Canonical concepts + node anchors (spec 025): the crosswalk moves from
    // profile-item-scoped verdicts to node<->canonical-concept anchors so every profile joins
    // for free; old comparison_alignments rows are deliberately dropped, not migrated — concept
    // ids are unknowable at migration time and re-judging costs cents.
    id: "0020_canonical_anchors",
    statements: [
      `DROP TABLE IF EXISTS comparison_alignments;`,
      `CREATE TABLE canonical_concepts (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        aliases_json TEXT NOT NULL,
        source_ref TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,
      `CREATE TABLE node_concept_anchors (
        node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
        concept_id TEXT NOT NULL REFERENCES canonical_concepts(id),
        verdict TEXT NOT NULL CHECK (verdict IN ('same','different')),
        confidence TEXT NOT NULL CHECK (confidence IN ('高','中','低')),
        method TEXT NOT NULL CHECK (method IN ('alias','judge')),
        reason TEXT NOT NULL,
        anchored_at TEXT NOT NULL,
        PRIMARY KEY (node_id, concept_id)
      );`,
      `CREATE INDEX idx_node_concept_anchors_node ON node_concept_anchors(node_id);`,
      `ALTER TABLE comparison_profile_items ADD COLUMN concept_id TEXT;`,
    ],
  },
  {
    // Occupation profiles + practice attestations + practice conversations (spec 026):
    // comparison_profiles gains a category so the UI can split the 教材/真人 toggle;
    // comparison_profile_items gains a kind so leaves render as knowledge/practice/tool
    // (structure = non-leaf organizational node). practice_attestations holds the user's own
    // self-report of a practice leaf — deliberately never AI-verified, mirroring the
    // mastery_claims self-report design (spec 011). conversations gains a kind so a practice
    // discussion opened from a practice item is saved but hidden from the sidebar's chat list.
    id: "0021_occupation_practice",
    statements: [
      `ALTER TABLE comparison_profiles ADD COLUMN category TEXT NOT NULL DEFAULT 'curriculum';`,
      `ALTER TABLE comparison_profile_items ADD COLUMN item_kind TEXT NOT NULL DEFAULT 'knowledge';`,
      `CREATE TABLE practice_attestations (
        item_id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('done','partial','not_yet')),
        attested_at TEXT NOT NULL
      );`,
      `ALTER TABLE conversations ADD COLUMN kind TEXT NOT NULL DEFAULT 'chat';`,
    ],
  },
];
