/**
 * Purpose: row types for every persisted table (mirrors migrations.ts exactly)
 * plus the SqlClient interface each host app injects.
 * Main exports: SqlClient, SettingRow, ConversationRow, MessageRow, LlmCallRow, KnowledgeEdgeRow.
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
