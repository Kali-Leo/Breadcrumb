/**
 * Purpose: row types for the comparison domain (spec 023/025/026/029) — evidence-backed
 * external profiles and their trees, the canonical concepts every profile item and knowledge
 * node crosswalks against, those anchors, and the learner's own practice self-scores.
 * Main exports: ComparisonProfileRow, ComparisonProfileItemRow, CanonicalConceptRow,
 * NodeConceptAnchorRow, PracticeScoreRow, CanonicalConceptEmbeddingRow.
 */
import type { AlignmentConfidence, AlignmentVerdict } from "./types";

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

/** Cached local embedding of one canonical concept (migration 0046). content_hash is a hash
 * of the exact text that was embedded, so only concepts whose text actually changed get
 * re-embedded. */
export interface CanonicalConceptEmbeddingRow {
  concept_id: string;
  content_hash: string;
  vector_json: string;
  created_at: string;
}
