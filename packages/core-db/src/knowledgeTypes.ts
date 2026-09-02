/**
 * Purpose: row types for the knowledge-graph domain — the learner's own tree of nodes, the
 * footprints left on it, the requires/helps edges between nodes, dedup aliases and verdicts,
 * the psychological interest signals read out of chat, mastery claims and goals.
 * Main exports: KnowledgeNodeRow, KnowledgeEdgeRow, NodeEmbeddingRow, NodeSightingRow,
 * NodeAliasRow, InterestSignalRow, MasteryClaimRow, GoalRow, NodeMergeRow, NodePairVerdictRow.
 */
import type { AlignmentVerdict } from "./types";

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
  /** The judge's one-sentence justification (migration 0048). NULL for edges recorded before
   * the column existed. Optional only at construction time, same convention as
   * NodeSightingRow.grade (0044): callers with no justification to record omit it and the
   * upsert writes NULL; every row read back from SQLite carries the key. */
  reasoning?: string | null;
  /** The assistant reply whose round produced this edge (migration 0048) — provenance, so an
   * edge can be traced back to the text it was inferred from. NULL when unknown. Optional at
   * construction time for the same reason as `reasoning`. */
  source_message_id?: string | null;
}

/** Locally-computed embedding of one knowledge node (vector stored as a JSON array). */
export interface NodeEmbeddingRow {
  node_id: string;
  model: string;
  vector_json: string;
  created_at: string;
}

/** How well the learner actually retrieved the concept at a footprint. Mirrors the four FSRS
 * ratings, because that is exactly what it is fed to. 'good' is the passive default: the
 * concept was merely met (extraction, re-encounter), with no retrieval attempt to grade. */
export type NodeSightingGrade = "again" | "hard" | "good" | "easy";

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
  /** Migration 0044. Optional only at construction time — callers that have no retrieval
   * signal omit it and the insert path writes 'good'. Every row read back from SQLite carries
   * a value (NOT NULL DEFAULT 'good'). The union is the whole validation: no CHECK constraint,
   * same TypeScript-side convention as conversations.kind (0029) and term_marks.target_kind. */
  grade?: NodeSightingGrade;
}

/** A label the node-dedup synonym gate (spec 015) judged identical to an existing node —
 * every later extraction round that produces this exact label hits node_id directly
 * (a sighting, never a duplicate node), without ever re-asking the LLM. */
export interface NodeAliasRow {
  alias_label: string;
  node_id: string;
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

/** One executed duplicate-node merge (migration 0045). duplicate_snapshot_json is the whole
 * knowledge_nodes row as it stood immediately before deletion, so a wrong merge stays
 * auditable and reversible. No foreign keys: duplicate_id names a row that no longer exists. */
export interface NodeMergeRow {
  id: string;
  canonical_id: string;
  duplicate_id: string;
  duplicate_snapshot_json: string;
  merged_at: string;
}

/** One cached synonym-judge verdict over a pair of EXISTING nodes (migration 0045). The pair
 * is stored normalized (node_a_id < node_b_id) so it has exactly one key regardless of which
 * order the sweep happened to generate it in. 'different' rows are the point: without them
 * the sweep re-asks the LLM about the same pairs on every startup, forever. */
export interface NodePairVerdictRow {
  node_a_id: string;
  node_b_id: string;
  verdict: AlignmentVerdict;
  judged_at: string;
}
