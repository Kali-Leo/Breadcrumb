/**
 * Purpose: shipped migrations 0029-0044. Part of the append-only MIGRATIONS list
 * assembled in ./index.ts — see that file for the rules.
 * 0029-0044 — the companion cast, per-message teaching mode/parent, conversation auto
 * titles, sighting provenance, focus sessions, term marks, companion proposal kinds, study
 * mode and sighting grades. (0038-0039 and 0041-0043 are retired — see RETIRED_MIGRATION_IDS.)
 * Main exports: MIGRATIONS_0029_0044.
 */
import type { Migration } from "./migration";

export const MIGRATIONS_0029_0044: readonly Migration[] = [
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
    // Spec 052: the composer's 学习模式 toggle. 0 = free chat (the default — Leo 2026-08-17:
    // main-chat replies carry no special guidance unless asked for), 1 = guided learning
    // (teaching contract + learner context, the pre-052 behavior). Boolean-as-INTEGER,
    // validated in TypeScript per the no-CHECK convention (0029-0031).
    id: "0040_study_mode",
    statements: [`ALTER TABLE conversations ADD COLUMN study_mode INTEGER NOT NULL DEFAULT 0;`],
  },
  {
    // Design audit 2026-08-28 (记忆与遗忘模型 #1, 掌握度评估 G2): every footprint used to be fed
    // to FSRS as a fixed "Good" review, so the one real retrieval signal the product has — the
    // concept guess, the teach-back judgment — was thrown away and difficulty never moved.
    // grade carries it: 'again' | 'hard' | 'good' | 'easy', the four FSRS ratings. 'good' is the
    // passive default (mere exposure), which is also what every pre-0044 row was, hence the
    // DEFAULT backfill. Value range is validated in TypeScript, not by a CHECK constraint —
    // same convention as conversations.kind (0029) and term_marks.target_kind (0036).
    id: "0044_sighting_grades",
    statements: [`ALTER TABLE node_sightings ADD COLUMN grade TEXT NOT NULL DEFAULT 'good';`],
  },
];
