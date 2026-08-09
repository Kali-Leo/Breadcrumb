/**
 * Purpose: row types for every persisted table (mirrors migrations.ts exactly)
 * plus the SqlClient interface each host app injects.
 * Main exports: SqlClient, SettingRow, ConversationRow, MessageRow, LlmCallRow, KnowledgeEdgeRow,
 * GoalRow, AiFailureRow, NodeAliasRow, GoalLadderBoardRow, ComparisonProfileRow,
 * ComparisonProfileItemRow, ComparisonAlignmentRow.
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

export interface ConversationRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  created_at: string;
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

/** 'learned' outweighs 'familiar' when computeMastery folds claims into the base retention. */
export type MasteryClaimLevel = "learned" | "familiar";
export type MasteryClaimSource = "self-report";

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

/** The ladder's per-goal display cache (spec 022) — the three assessment titles currently on
 * the board (the learner's own summary flanked by a slightly-ahead and slightly-behind state)
 * plus when this board expires. Pure display: no ranks, no progress semantics of any kind. */
export interface GoalLadderBoardRow {
  goal_id: string;
  above_title: string;
  self_title: string;
  below_title: string;
  next_refresh_at: string;
  updated_at: string;
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

/** A comparison tree's root: an evidence-backed real-world profile the user's own tree can be
 * measured against (spec 023). 'builtin' ships with the app; 'searched' was found on demand via
 * an open web search. Standalone module — unrelated to the ladder or the knowledge tree. */
export interface ComparisonProfileRow {
  id: string;
  title: string;
  origin: "builtin" | "searched";
  description: string;
  source_note: string;
  created_at: string;
}

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
}

export type AlignmentVerdict = "same" | "different";
export type AlignmentConfidence = "高" | "中" | "低";

/** One crosswalk verdict between a comparison profile item and a user knowledge node (spec
 * 024). PRIMARY KEY (item_id, node_id) means a pair is judged exactly once — both 'same' and
 * 'different' verdicts are stored so the LLM is never asked about the same pair twice. */
export interface ComparisonAlignmentRow {
  item_id: string;
  node_id: string;
  profile_id: string;
  verdict: AlignmentVerdict;
  confidence: AlignmentConfidence;
  reason: string;
  judged_at: string;
}
