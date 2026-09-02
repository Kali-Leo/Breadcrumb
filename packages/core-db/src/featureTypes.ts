/**
 * Purpose: row types for the standalone feature side-tables — map place-name overrides, the
 * daily trail summary, the fact-check runs and their claims, and the silent AI-failure log.
 * These share a file for the same reason featureRepositories.ts does: each is one small table
 * belonging to one feature, with nothing in common but their size.
 * Main exports: MapPlaceNameRow, TrailSummaryRow, FactcheckRunRow, FactcheckClaimRow,
 * AiFailureRow.
 */

/** Memory-palace place-name override — decoupled from the knowledge concept itself. */
export interface MapPlaceNameRow {
  node_id: string;
  custom_label: string;
  /** 'user' names always outrank 'ai' suggestions and are never overwritten by AI. */
  source: "user" | "ai";
  updated_at: string;
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
