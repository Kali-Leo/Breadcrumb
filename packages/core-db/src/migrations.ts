/**
 * Purpose: versioned, append-only SQL migrations with exactly-once tracking via the
 * _migrations table. Never edit a shipped migration — append a new one.
 * Main exports: MIGRATIONS, runMigrations.
 */
import type { SqlClient } from "./types";

export interface Migration {
  /** Stable id, ordered lexicographically, e.g. "0003_user_level_tree". */
  id: string;
  statements: readonly string[];
}

export const MIGRATIONS: readonly Migration[] = [
  {
    id: "0001_initial",
    statements: [
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);`,
      `CREATE TABLE IF NOT EXISTS llm_calls (
        id TEXT PRIMARY KEY,
        conversation_id TEXT REFERENCES conversations(id),
        purpose TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        cost_micros INTEGER NOT NULL,
        currency TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_llm_calls_created ON llm_calls(created_at);`,
    ],
  },
  {
    id: "0002_knowledge_and_trail",
    statements: [
      `CREATE TABLE IF NOT EXISTS knowledge_nodes (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        parent_id TEXT REFERENCES knowledge_nodes(id),
        label TEXT NOT NULL,
        summary TEXT NOT NULL,
        source_message_id TEXT REFERENCES messages(id),
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_conversation ON knowledge_nodes(conversation_id);`,
      `CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_created ON knowledge_nodes(created_at);`,
      `CREATE TABLE IF NOT EXISTS trail_summaries (
        date TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,
    ],
  },
  {
    // The tree becomes a USER attribute: nodes are globally unique by label;
    // conversations leave sightings (footprints) instead of owning nodes.
    id: "0003_user_level_tree",
    statements: [
      `CREATE TABLE knowledge_nodes_v2 (
        id TEXT PRIMARY KEY,
        parent_id TEXT REFERENCES knowledge_nodes_v2(id),
        label TEXT NOT NULL UNIQUE,
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,
      // Earliest node of each label survives as the canonical one.
      `INSERT OR IGNORE INTO knowledge_nodes_v2 (id, parent_id, label, summary, created_at)
       SELECT id, parent_id, label, summary, created_at FROM knowledge_nodes ORDER BY created_at ASC, id ASC;`,
      // Parents that were deduplicated away are re-pointed to the surviving same-label node.
      `UPDATE knowledge_nodes_v2 SET parent_id = (
         SELECT v2.id FROM knowledge_nodes old
         JOIN knowledge_nodes_v2 v2 ON v2.label = old.label
         WHERE old.id = knowledge_nodes_v2.parent_id
       ) WHERE parent_id IS NOT NULL AND parent_id NOT IN (SELECT id FROM knowledge_nodes_v2);`,
      `CREATE TABLE node_sightings (
        id TEXT PRIMARY KEY,
        node_id TEXT NOT NULL REFERENCES knowledge_nodes_v2(id),
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        message_id TEXT REFERENCES messages(id),
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX idx_node_sightings_conversation ON node_sightings(conversation_id);`,
      `CREATE INDEX idx_node_sightings_node ON node_sightings(node_id);`,
      // Every legacy per-conversation node becomes one sighting of its canonical node.
      `INSERT INTO node_sightings (id, node_id, conversation_id, message_id, created_at)
       SELECT old.id || '-s', v2.id, old.conversation_id, old.source_message_id, old.created_at
       FROM knowledge_nodes old JOIN knowledge_nodes_v2 v2 ON v2.label = old.label;`,
      `DROP TABLE knowledge_nodes;`,
      `ALTER TABLE knowledge_nodes_v2 RENAME TO knowledge_nodes;`,
      `CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_created ON knowledge_nodes(created_at);`,
    ],
  },
  {
    // Locally-computed embedding per knowledge node — the map's spatial raw material.
    id: "0004_node_embeddings",
    statements: [
      `CREATE TABLE node_embeddings (
        node_id TEXT PRIMARY KEY REFERENCES knowledge_nodes(id),
        model TEXT NOT NULL,
        vector_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,
    ],
  },
  {
    // Memory-palace place-name overrides: renaming an island never rewrites the
    // knowledge concept itself. source 'user' always outranks 'ai'.
    id: "0005_map_place_names",
    statements: [
      `CREATE TABLE map_place_names (
        node_id TEXT PRIMARY KEY REFERENCES knowledge_nodes(id),
        custom_label TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('user','ai')),
        updated_at TEXT NOT NULL
      );`,
    ],
  },
  {
    // Fact-check results per assistant message: one run holds gentle per-claim verdicts
    // with their verified evidence (spec 009). Renumbered from 0005_factcheck at merge
    // time; safe because no local database had applied the old id yet.
    id: "0006_factcheck",
    statements: [
      `CREATE TABLE factcheck_runs (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES messages(id),
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX idx_factcheck_runs_message ON factcheck_runs(message_id);`,
      `CREATE INDEX idx_factcheck_runs_conversation ON factcheck_runs(conversation_id);`,
      `CREATE TABLE factcheck_claims (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES factcheck_runs(id),
        claim_text TEXT NOT NULL,
        relationship TEXT NOT NULL,
        reasoning TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX idx_factcheck_claims_run ON factcheck_claims(run_id);`,
    ],
  },
  {
    // Directed learning-structure edges over the tree (spec 010): 'requires' (hard
    // prerequisite, weight always 1) and 'helps' (weighted aid, weight 0~1). Learning
    // methods become first-class nodes via the new 'kind' column, linked by 'helps' edges.
    id: "0007_knowledge_edges",
    statements: [
      `ALTER TABLE knowledge_nodes ADD COLUMN kind TEXT NOT NULL DEFAULT 'concept';`,
      `CREATE TABLE knowledge_edges (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
        target_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
        edge_type TEXT NOT NULL CHECK (edge_type IN ('requires','helps')),
        weight REAL NOT NULL,
        confidence REAL NOT NULL,
        origin TEXT NOT NULL CHECK (origin IN ('llm','user')),
        created_at TEXT NOT NULL,
        UNIQUE (source_id, target_id, edge_type)
      );`,
      `CREATE INDEX idx_knowledge_edges_source ON knowledge_edges(source_id);`,
      `CREATE INDEX idx_knowledge_edges_target ON knowledge_edges(target_id);`,
    ],
  },
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
  {
    // Spec 037 companion cast: conversations gain an optional companion_id (an existing
    // 'teach' conversation with a companion_id is played by the Shichimi card instead of the
    // generic teach prompt; a new 'companion' kind is added at the type layer only — no CHECK
    // constraint here since ConversationRow.kind is validated in TypeScript, matching 0021's
    // precedent of not constraining the kind column in SQL). companion_memories is the
    // Stanford-generative-agents-style memory stream (importance-scored observations plus
    // periodic reflections). companion_proposals records the proactive teach-back gate's
    // decisions (accept/decline/expire) so the exponential backoff can read the recent streak.
    // companion_knowledge_state holds one JSON snapshot per teach-back conversation — the
    // Reflect-Respond student model the companion is only ever allowed to answer from.
    id: "0029_companion_cast",
    statements: [
      `ALTER TABLE conversations ADD COLUMN companion_id TEXT;`,
      `CREATE TABLE companion_memories (
        id TEXT PRIMARY KEY,
        companion_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('observation','reflection')),
        content TEXT NOT NULL,
        importance INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        last_accessed_at TEXT NOT NULL
      );`,
      `CREATE INDEX idx_companion_memories_companion ON companion_memories(companion_id, created_at);`,
      `CREATE TABLE companion_proposals (
        id TEXT PRIMARY KEY,
        companion_id TEXT NOT NULL,
        node_id TEXT,
        topic TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending','accepted','declined','expired')),
        created_at TEXT NOT NULL,
        resolved_at TEXT
      );`,
      `CREATE INDEX idx_companion_proposals_companion ON companion_proposals(companion_id, created_at);`,
      `CREATE TABLE companion_knowledge_state (
        conversation_id TEXT PRIMARY KEY REFERENCES conversations(id),
        state_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,
    ],
  },
  {
    // Spec 038 §2.5: assistant replies in plain 'chat' conversations record which teaching
    // mode (adaptive/direct/guided) produced them, so the feedback lab can show plain
    // per-mode usage facts. NULL for user messages, non-chat kinds, and all history.
    // No CHECK constraint — the value set is validated in TypeScript, same as
    // conversations.kind (see 0029's precedent note).
    id: "0030_message_teaching_mode",
    statements: [`ALTER TABLE messages ADD COLUMN teaching_mode TEXT;`],
  },
  {
    // Spec 040 §1: messages form a tree — parent_id points at the message this one replies
    // to (user msg -> current leaf, assistant msg -> its triggering user msg). NULL rows are
    // legacy-linear: the previous message by created_at is the implicit parent. No FK/CHECK —
    // validated in TypeScript, same as conversations.kind (0029 precedent).
    id: "0031_message_parent",
    statements: [`ALTER TABLE messages ADD COLUMN parent_id TEXT;`],
  },
  {
    // Spec 041 §1: system-maintained trail-card name ("first station -> last station"). The
    // user-edited `title` column always wins for display and is never overwritten by this one.
    id: "0032_conversation_auto_title",
    statements: [`ALTER TABLE conversations ADD COLUMN auto_title TEXT;`],
  },
  {
    // Spec 040 §7 provenance — the station this node grew from: the round's anchored node or
    // a door's host station; NULL = unknown/legacy, model falls back to edge inference.
    id: "0033_sighting_origin",
    statements: [`ALTER TABLE node_sightings ADD COLUMN origin_node_id TEXT;`],
  },
  {
    // Spec 042 §1 — one full-screen focus (explain-word) session per subway-map-v2 view.
    // focus_sessions.entry_message_id stays NULL while the session is in progress and is
    // filled in on exit (§5), when the session's record text lands as a real assistant
    // message in the host conversation. focus_nodes.parent_id NULL = the session's root; kind
    // is 'word' (solid-line child station, opened by picking a word) or 'question' (dashed
    // diagonal station, opened by the free-text prompt box) — validated in TypeScript rather
    // than a CHECK constraint, matching 0029's precedent for enum-like text columns.
    // question_text is only set for kind='question'; answer_text always holds the node's
    // full reply, which is what downstream nodes quote as their prompt context (§2).
    id: "0034_focus_sessions",
    statements: [
      `CREATE TABLE focus_sessions (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        entry_message_id TEXT,
        root_label TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,
      `CREATE INDEX idx_focus_sessions_conversation ON focus_sessions(conversation_id);`,
      `CREATE TABLE focus_nodes (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES focus_sessions(id),
        parent_id TEXT,
        kind TEXT NOT NULL,
        label TEXT NOT NULL,
        question_text TEXT,
        answer_text TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX idx_focus_nodes_session ON focus_nodes(session_id, created_at);`,
    ],
  },
  {
    // Leo 2026-08-14 ruling: a focus session's exit no longer writes a message into the host
    // conversation (spec 042 §5 revision) — entry_message_id is retired. source_message_id is
    // the reply the session was born from instead: its in-place badge anchor, set once at
    // session creation and never rewritten. NULL for legacy/pre-0035 sessions.
    id: "0035_focus_session_source_message",
    statements: [`ALTER TABLE focus_sessions ADD COLUMN source_message_id TEXT;`],
  },
  {
    // Spec 043 §5: caches one term-marking LLM call's verdict per (target_kind, target_id) so
    // a message or focus-node answer is ever marked at most once — a second door-picking pass
    // over the same target reads this row instead of paying for another call. target_kind is
    // 'message' | 'focus_node', validated in TypeScript (same precedent as conversations.kind,
    // 0029). terms_json holds the ordered (obstruction-descending) term list exactly as clipped
    // before insert, i.e. what actually shipped as doors.
    id: "0036_term_marks",
    statements: [
      `CREATE TABLE term_marks (
        id TEXT PRIMARY KEY,
        target_kind TEXT NOT NULL,
        target_id TEXT NOT NULL,
        terms_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,
      `CREATE UNIQUE INDEX idx_term_marks_target ON term_marks(target_kind, target_id);`,
    ],
  },
  {
    // Spec 048 §5: reunion invitations join teach-back in the companion proposal gate —
    // one kind column tells them apart; every pre-existing row was a teach proposal.
    id: "0037_companion_proposal_kind",
    statements: [`ALTER TABLE companion_proposals ADD COLUMN kind TEXT NOT NULL DEFAULT 'teach';`],
  },
  {
    // Spec 051 — 发现页. discovery_cards holds one knowledge card per row: title/hook ship at
    // batch-generation time, body_md and embedding_json are lazy-filled later (body on first
    // open, embedding once fastembed runs) so a freshly generated batch is cheap. source is
    // validated in TypeScript ('nearby' | 'explore' | 'starter'), same precedent as
    // conversations.kind (0029) — no CHECK constraint. batch_id groups cards generated by the
    // same LLM call, for debugging/backfill; opened_at is NULL until the card is first opened.
    // discovery_events is the silent signal stream (impression/open/dwell/dislike) the interest
    // model folds over; topic_label is denormalized from the card at write time so the fold
    // never needs a join once a card is deleted or the label taxonomy shifts. value_ms only
    // carries a value for 'dwell' events.
    id: "0038_discovery_feed",
    statements: [
      `CREATE TABLE discovery_cards (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        hook TEXT NOT NULL,
        topic_label TEXT NOT NULL,
        source TEXT NOT NULL,
        body_md TEXT,
        embedding_json TEXT,
        batch_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        opened_at TEXT
      );`,
      `CREATE INDEX idx_discovery_cards_created ON discovery_cards(created_at);`,
      `CREATE TABLE discovery_events (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL,
        topic_label TEXT NOT NULL,
        kind TEXT NOT NULL,
        value_ms INTEGER,
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX idx_discovery_events_created ON discovery_events(created_at);`,
    ],
  },
  {
    // The first card generation shipped with a hook style that spoiled its own answer
    // (2026-08-17 fix); unopened stubs of that era read stale next to the new style, so
    // they are cleared — opened cards keep their generated articles.
    id: "0039_discovery_clear_unopened_stubs",
    statements: [
      `DELETE FROM discovery_events WHERE card_id IN (
        SELECT id FROM discovery_cards WHERE opened_at IS NULL AND body_md IS NULL
      ) AND kind = 'impression'`,
      `DELETE FROM discovery_cards WHERE opened_at IS NULL AND body_md IS NULL
        AND id NOT IN (SELECT card_id FROM discovery_events)`,
    ],
  },
  {
    // Spec 052: the composer's 学习模式 toggle. 0 = free chat (the default — Leo 2026-08-17:
    // main-chat replies carry no special guidance unless asked for), 1 = guided learning
    // (teaching contract + learner context, the pre-052 behavior). Boolean-as-INTEGER,
    // validated in TypeScript per the no-CHECK convention (0029-0031).
    id: "0040_study_mode",
    statements: [`ALTER TABLE conversations ADD COLUMN study_mode INTEGER NOT NULL DEFAULT 0;`],
  },
  {
    // Spec 053: the feed's cards become real external content instead of self-generated ones.
    // Purely additive — every column is nullable, so the retired 051 pipeline's rows stay
    // valid and readable with all eight new columns NULL. source_id names the channel the
    // item came from (a plugin-channels catalog entry), kind is the content form
    // ('article' | 'video' | 'podcast' | 'discussion' | 'paper'), validated in TypeScript per
    // the no-CHECK convention (0029-0031, 0038). saved_at carries spec 053 §6's 收藏 — set on
    // save, back to NULL on unsave, deliberately never merged with any "like" semantics.
    // quality_score is the batch LLM quality check (§5), which only ever lowers ranking.
    // discovery_events.kind stays a plain TEXT with no CHECK (see 0038), so the new event
    // kinds ('save' | 'unsave' | 'finish' | 'dial' | 'onboarding') need no schema change;
    // value_ms is reused as their generic payload, encoded and decoded in the app layer.
    // channel_state is one row per channel: the conditional-request validators (ETag /
    // Last-Modified) that make a repeat poll near-zero-bytes, the reachability + failure
    // count driving silent skipping and exponential backoff, and the per-day request budget
    // (daily_budget_used counted against budget_day, a YYYY-MM-DD local day string).
    id: "0041_external_content_feed",
    statements: [
      `ALTER TABLE discovery_cards ADD COLUMN source_id TEXT;`,
      `ALTER TABLE discovery_cards ADD COLUMN kind TEXT;`,
      `ALTER TABLE discovery_cards ADD COLUMN url TEXT;`,
      `ALTER TABLE discovery_cards ADD COLUMN cover_url TEXT;`,
      `ALTER TABLE discovery_cards ADD COLUMN author TEXT;`,
      `ALTER TABLE discovery_cards ADD COLUMN published_at TEXT;`,
      `ALTER TABLE discovery_cards ADD COLUMN saved_at TEXT;`,
      `ALTER TABLE discovery_cards ADD COLUMN quality_score REAL;`,
      `CREATE INDEX idx_discovery_cards_saved ON discovery_cards(saved_at);`,
      `CREATE TABLE channel_state (
        source_id TEXT PRIMARY KEY,
        etag TEXT,
        last_modified TEXT,
        last_fetch_at TEXT,
        reachable INTEGER,
        failure_count INTEGER,
        daily_budget_used INTEGER,
        budget_day TEXT
      );`,
    ],
  },
  {
    // Spec 053 §4 ranks candidates partly on the crowd signal their channel published — a
    // Hacker News point count, a forum's reply count, a chart position — normalized to 0..1 by
    // the channel layer. 0041 landed every other field of the candidate contract but this one,
    // so it had nowhere to be stored and the ranking feature had nothing to read. Nullable
    // like the rest: most plain RSS feeds publish no such number, and no number must never
    // read as a low one.
    id: "0042_discovery_upstream_signal",
    statements: [`ALTER TABLE discovery_cards ADD COLUMN upstream_signal REAL;`],
  },
  {
    // A podcast card's url is the episode's page; the audio file is a second address the feed
    // publishes as an enclosure, and 0041 had nowhere to keep it. Without it the in-app player
    // was handed a web page as its audio source and every episode failed to play (spec 053 §7).
    // Nullable: only podcasts carry one, and even some podcast feeds link the page alone.
    id: "0043_discovery_media_url",
    statements: [`ALTER TABLE discovery_cards ADD COLUMN media_url TEXT;`],
  },
];

/** Applies every migration not yet recorded in _migrations, oldest first, exactly once. */
export async function runMigrations(sql: SqlClient): Promise<void> {
  await sql.execute(
    "CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  // Repair a legacy id: factcheck first shipped as 0005_factcheck and was renumbered to
  // 0006_factcheck when 0005_map_place_names merged ahead of it. Databases migrated under
  // the old id would otherwise re-run the migration and abort on existing tables.
  await sql.execute(
    `UPDATE _migrations SET id = '0006_factcheck'
     WHERE id = '0005_factcheck'
       AND NOT EXISTS (SELECT 1 FROM _migrations WHERE id = '0006_factcheck')`,
  );
  const appliedRows = await sql.select<{ id: string }>("SELECT id FROM _migrations");
  const applied = new Set(appliedRows.map((row) => row.id));
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    // One transaction per migration, bookkeeping row included: a crash mid-migration leaves
    // it cleanly unapplied instead of half-applied (which would re-run on next boot and
    // abort on "table already exists", bricking startup). Safe because every migration here
    // is plain DDL/DML — SQLite allows all of it, including 0027's table rebuild, inside a
    // transaction (no PRAGMA/VACUUM/ATTACH statements exist in this list).
    await sql.executeTransaction([
      ...migration.statements.map((statement) => ({ sql: statement })),
      {
        sql: "INSERT INTO _migrations (id, applied_at) VALUES (?, ?)",
        params: [migration.id, new Date().toISOString()],
      },
    ]);
  }
}
