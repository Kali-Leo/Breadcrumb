/**
 * Purpose: row types for every persisted table (mirrors migrations.ts exactly)
 * plus the SqlClient interface each host app injects.
 * Main exports: SqlClient, SettingRow, ConversationRow, MessageRow, LlmCallRow, KnowledgeEdgeRow,
 * GoalRow, AiFailureRow, NodeAliasRow, ComparisonProfileRow,
 * ComparisonProfileItemRow, CanonicalConceptRow, NodeConceptAnchorRow,
 * PracticeScoreRow.
 */

/** Minimal SQL access the host provides (tauri-plugin-sql in the app, fakes in tests). */
export interface SqlClient {
  /** Runs a SELECT; returns rows as objects keyed by column name. */
  select<Row>(sql: string, params?: readonly unknown[]): Promise<Row[]>;
  /** Runs a mutating statement (INSERT/UPDATE/DELETE/DDL). */
  execute(sql: string, params?: readonly unknown[]): Promise<void>;
}

export type MessageRole = "user" | "assistant" | "system";
export type Currency = "USD" | "CNY";

export interface SettingRow {
  key: string;
  value_json: string;
  updated_at: string;
}

/** 'chat' = an ordinary conversation, listed in the sidebar. 'practice' = a discussion opened
 * from a practice item (spec 026) — saved like any other conversation but hidden from the
 * sidebar's chat list, since it is a temporary offshoot of one practice leaf, not a standing
 * learning thread. 'teach' = a teach-back session (spec 034); when its companion_id is set
 * the student side is played by the Shichimi companion card (spec 037) instead of the
 * generic teach prompt. 'companion' = a chat opened with one of the three companion cards. */
export type ConversationKind = "chat" | "practice" | "teach" | "companion";

export interface ConversationRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  kind: ConversationKind;
  /** Which companion card (e.g. "shichimi", "pepper", "cumin") owns this conversation —
   * null for ordinary chat/practice threads that have no companion attached (spec 037). */
  companion_id: string | null;
  /** System-maintained trail-card name, "first station -> last station" (spec 041 §1) — null
   * until the conversation has any knowledge-node sighting. Display order is `auto_title ??
   * title`: once the user renames a conversation this column is cleared and stops updating,
   * so the rename always wins. */
  auto_title: string | null;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  created_at: string;
  /** Teaching mode that produced an assistant reply in a plain chat — "adaptive" | "direct" |
   * "guided" — NULL otherwise (spec 038). Kept as string here: core-db does not depend on
   * core-teaching. */
  teaching_mode: string | null;
  /** Tree parent (spec 040): the message this one replies to (user msg -> current leaf,
   * assistant msg -> its triggering user msg). NULL means "legacy-linear" — the implicit
   * parent is the previous row by created_at within the same conversation. */
  parent_id: string | null;
}

/** 'concept' = a topic in the taxonomy tree; 'method' = a learning technique (e.g. Feynman
 * technique) that helps understand one or more concepts via a 'helps' edge. */
export type KnowledgeNodeKind = "concept" | "method";

/** A node of the USER's global knowledge tree (unique by label). */
export interface KnowledgeNodeRow {
  id: string;
  /** null = a root node of the user's tree. */
  parent_id: string | null;
  label: string;
  summary: string;
  kind: KnowledgeNodeKind;
  created_at: string;
}

/** requires = hard prerequisite (weight always 1): source_id must be learned before
 * target_id. helps = weighted aid to understanding (weight 0~1), direction-neutral in
 * spirit but stored as source helps target. */
export type KnowledgeEdgeType = "requires" | "helps";
export type KnowledgeEdgeOrigin = "llm" | "user";

/** A directed learning-structure edge between two knowledge_nodes (spec 010). */
export interface KnowledgeEdgeRow {
  id: string;
  source_id: string;
  target_id: string;
  edge_type: KnowledgeEdgeType;
  weight: number;
  confidence: number;
  origin: KnowledgeEdgeOrigin;
  created_at: string;
}

/** Locally-computed embedding of one knowledge node (vector stored as a JSON array). */
export interface NodeEmbeddingRow {
  node_id: string;
  model: string;
  vector_json: string;
  created_at: string;
}

/** Memory-palace place-name override — decoupled from the knowledge concept itself. */
export interface MapPlaceNameRow {
  node_id: string;
  custom_label: string;
  /** 'user' names always outrank 'ai' suggestions and are never overwritten by AI. */
  source: "user" | "ai";
  updated_at: string;
}

/** One footprint: a conversation touched (learned or re-met) a knowledge node. */
export interface NodeSightingRow {
  id: string;
  node_id: string;
  conversation_id: string;
  message_id: string | null;
  created_at: string;
  /** Spec 040 §7 provenance: the station this node grew from (the round's anchored node, or a
   * door's host station). NULL = unknown/legacy — the station map falls back to edge inference. */
  origin_node_id: string | null;
}

/** A label the node-dedup synonym gate (spec 015) judged identical to an existing node —
 * every later extraction round that produces this exact label hits node_id directly
 * (a sighting, never a duplicate node), without ever re-asking the LLM. */
export interface NodeAliasRow {
  alias_label: string;
  node_id: string;
  created_at: string;
}

export interface TrailSummaryRow {
  /** Local calendar date, e.g. "2026-07-29". One gentle summary per day. */
  date: string;
  content: string;
  created_at: string;
}

/** One fact-check pass over one assistant message (spec 009). */
export interface FactcheckRunRow {
  id: string;
  message_id: string;
  conversation_id: string;
  created_at: string;
}

/** One checked claim inside a run; evidence_json holds the verified EvidenceItem array. */
export interface FactcheckClaimRow {
  id: string;
  run_id: string;
  claim_text: string;
  /** "supported" | "contradicted" | "insufficient" — kept TEXT for forward compatibility. */
  relationship: string;
  reasoning: string;
  evidence_json: string;
  created_at: string;
}

/** One LLM-observed psychological signal for a node in one chat round (spec 011). */
export interface InterestSignalRow {
  id: string;
  node_id: string;
  conversation_id: string;
  /** 0 (none) ~ 1 (strong) — active follow-up questions, "tell me more". */
  curiosity: number;
  /** 0 (none) ~ 1 (strong) — repeated confusion, "I don't get it". */
  confusion: number;
  /** 0 (none) ~ 1 (strong) — disengagement, wanting to skip ahead. */
  boredom: number;
  /** How sure the extraction pass is about this whole read (spec 014, migration 0011):
   * 0.3 (低) / 0.6 (中) / 0.9 (高). Rows from before the column existed default to 0.6. */
  confidence: number;
  /** JSON string array of preferred explanation-style tags, e.g. ["类比","代码示例"]. */
  styles_json: string;
  created_at: string;
}

/** 'learned' outweighs 'familiar'; taught_* levels come from teach-back explanation
 * quality judgments (vision/09 #2) — behavioral evidence, weighted above self-report. */
export type MasteryClaimLevel = "learned" | "familiar" | "taught_principled" | "taught_surface";
export type MasteryClaimSource = "self-report" | "teach-back";

/** A user's self-reported prior knowledge of a node — cold-start evidence, weighted below
 * real footprints (spec 011). */
export interface MasteryClaimRow {
  id: string;
  node_id: string;
  level: MasteryClaimLevel;
  source: MasteryClaimSource;
  created_at: string;
}

/** A learning goal set up in the experimental lab panel (spec 012) — a title plus the set
 * of tree node ids it maps to (existing nodes and freshly-inserted suggested ones alike). */
export interface GoalRow {
  id: string;
  title: string;
  /** JSON string array of knowledge_nodes ids. */
  node_ids_json: string;
  created_at: string;
  updated_at: string;
}

export interface LlmCallRow {
  id: string;
  conversation_id: string | null;
  /** Which feature made the call, e.g. "chat"; future plugins use their plugin id. */
  purpose: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_micros: number;
  currency: Currency;
  created_at: string;
}

/** One silently-degraded AI pipeline failure (spec 014) — never shown to the user, visible
 * only to the developer via the lab panel's "最近的静默失败" section. Writing this row is
 * itself best-effort: a failure to record a failure must never throw. */
export interface AiFailureRow {
  id: string;
  /** Which pipeline failed, e.g. "interest", "knowledge-edges", "goal-planning". */
  purpose: string;
  message: string;
  created_at: string;
}

/** Which side of the 教材/真人 toggle a comparison profile belongs to (spec 026): 'curriculum'
 * = a syllabus/skill-tree profile (the original spec 023 shape); 'occupation' = a real person's
 * self-reported career profile, whose leaves carry practice self-attestations rather than pure
 * knowledge matching. */
export type ComparisonProfileCategory = "curriculum" | "occupation";

/** A comparison tree's root: an evidence-backed real-world profile the user's own tree can be
 * measured against (spec 023). 'builtin' ships with the app; 'searched' was found on demand via
 * an open web search. Standalone module — unrelated to the knowledge tree. */
export interface ComparisonProfileRow {
  id: string;
  title: string;
  origin: "builtin" | "searched";
  description: string;
  source_note: string;
  created_at: string;
  category: ComparisonProfileCategory;
}

/** A leaf's nature (spec 026): 'knowledge' = matched against the user's knowledge tree as
 * before; 'practice' = matched against the user's own practice attestation, never AI-verified;
 * 'tool' = a concrete tool/technology used in the role. 'structure' marks a non-leaf
 * organizational node (a branch heading), never itself matched or attested. */
export type ComparisonItemKind = "knowledge" | "practice" | "tool" | "hub" | "structure";

/** One node of a comparison profile's tree. AI-invented content is forbidden here, so
 * source_ref must always be non-empty — it points at where this item's existence was verified
 * (e.g. a syllabus URL, a book citation). */
export interface ComparisonProfileItemRow {
  id: string;
  profile_id: string;
  /** null = a root item of the profile's tree. */
  parent_id: string | null;
  label: string;
  /** JSON string array of alternate labels for matching against the user's own tree. */
  aliases_json: string;
  source_ref: string;
  position: number;
  /** The canonical concept this item embodies (spec 025); null for coarse/searched items that
   * have not been anchored to a canonical concept. */
  concept_id: string | null;
  item_kind: ComparisonItemKind;
}

export type AlignmentVerdict = "same" | "different";
export type AlignmentConfidence = "高" | "中" | "低";

/** A concept-space anchor point, independent of any one comparison profile (spec 025) — the
 * unit every profile item and every knowledge node ultimately crosswalks against. */
export interface CanonicalConceptRow {
  id: string;
  label: string;
  /** JSON string array of alternate labels for matching. */
  aliases_json: string;
  source_ref: string;
  created_at: string;
}

/** How a node<->concept anchor was decided: 'alias' = matched via a known alternate label,
 * no LLM call needed; 'judge' = an LLM verdict was required. */
export type AnchorMethod = "alias" | "judge";

/** One crosswalk verdict between a user knowledge node and a canonical concept (spec 025).
 * PRIMARY KEY (node_id, concept_id) means a pair is judged exactly once — both 'same' and
 * 'different' verdicts are stored so the LLM is never asked about the same pair twice. Because
 * this anchors nodes to concepts rather than to one profile's items, every profile that shares
 * a concept benefits for free. */
export interface NodeConceptAnchorRow {
  node_id: string;
  concept_id: string;
  verdict: AlignmentVerdict;
  confidence: AlignmentConfidence;
  method: AnchorMethod;
  reason: string;
  anchored_at: string;
}

/** The learner's own 0–10 score on a pure experience leaf (spec 029) — never AI-verified,
 * deliberately: the user is the only expert on their own experience. One row per item, keyed
 * by item_id, overwritten in place as the self-report changes over time. */
export interface PracticeScoreRow {
  item_id: string;
  /** Integer 0–10 (DB CHECK enforced); ratio contribution is score / 10. */
  score: number;
  scored_at: string;
}

/** One full-screen focus (explain-word) session — a subway-map-v2 exploration rooted at a
 * word picked from an ordinary reply (spec 042 §1, §5). entry_message_id is a legacy column:
 * pre-2026-08-14 sessions filled it in on exit with the id of the assistant message their exit
 * record was appended as; that no longer happens, so it stays NULL on every session created from
 * 0035 onward. source_message_id (0035) replaces it — the reply the session was born from, set
 * at creation time and never rewritten; it anchors the session's in-place badge and is NULL for
 * legacy/pre-0035 sessions. */
export interface FocusSessionRow {
  id: string;
  conversation_id: string;
  entry_message_id: string | null;
  root_label: string;
  created_at: string;
  updated_at: string;
  source_message_id: string | null;
}

/** 'word' = solid-line child station opened by picking a word inside the parent's answer;
 * 'question' = dashed diagonal station opened by the free-text prompt box (spec 042 §4). */
export type FocusNodeKind = "word" | "question";

/** One station of a focus session's subway map (spec 042 §1). parent_id NULL = the session's
 * root station. question_text is set only for kind='question'; answer_text is always the
 * node's full reply and is what descendant nodes quote as prompt context (§2). kind is
 * validated in TypeScript, not a DB CHECK — same precedent as conversations.kind (0029). */
export interface FocusNodeRow {
  id: string;
  session_id: string;
  parent_id: string | null;
  kind: FocusNodeKind;
  label: string;
  question_text: string | null;
  answer_text: string;
  created_at: string;
}

/** Which kind of answer a term-marking pass was run against (spec 043 §5). Validated in
 * TypeScript, not a DB CHECK — same precedent as conversations.kind (0029). */
export type TermMarkTargetKind = "message" | "focus_node";

/** One cached term-marking verdict, keyed uniquely by (target_kind, target_id) — a second
 * lookup for the same target reuses this row instead of paying for another LLM call (spec 043
 * §5). terms_json is a JSON array of the ordered (obstruction-descending), already-clipped term
 * strings that shipped as doors. */
export interface TermMarkRow {
  id: string;
  target_kind: TermMarkTargetKind;
  target_id: string;
  terms_json: string;
  created_at: string;
}
