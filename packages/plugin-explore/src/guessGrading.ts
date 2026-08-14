/**
 * Purpose: concept guess grading thresholds and feedback lines (spec 039 §2.2) — the cosine
 * cutoffs are an empirical starting point for e5-small embeddings, tunable constants, not a
 * calibrated model. Feedback is plain statement only (product principle 1: no praise, no
 * pressure).
 * Main exports: gradeConceptGuess, guessFeedbackLine, ConceptGuessGrade,
 * CORRECT_COSINE_THRESHOLD, CLOSE_COSINE_THRESHOLD.
 */

export type ConceptGuessGrade = "correct" | "close" | "wrong";

/** Cosine similarity (guess text vs. node label+summary, e5-small embedding) at or above
 * this is graded correct. */
export const CORRECT_COSINE_THRESHOLD = 0.87;
/** Cosine similarity at or above this (but below the correct threshold) is graded close. */
export const CLOSE_COSINE_THRESHOLD = 0.82;

/** Grades a concept guess from its embedding cosine similarity to the node's label+summary. */
export function gradeConceptGuess(cosine: number): ConceptGuessGrade {
  if (cosine >= CORRECT_COSINE_THRESHOLD) return "correct";
  if (cosine >= CLOSE_COSINE_THRESHOLD) return "close";
  return "wrong";
}

/** Plain-statement feedback line for a graded concept guess (no praise, no pressure). */
export function guessFeedbackLine(grade: ConceptGuessGrade, summary: string): string {
  switch (grade) {
    case "correct":
      return `对。${summary}`;
    case "close":
      return `接近。它是指：${summary}`;
    case "wrong":
      return `它是指：${summary}`;
  }
}
