/**
 * Purpose: concept guess grading thresholds and feedback lines (spec 039 §2.2) — the cosine
 * cutoffs are an empirical starting point for e5-small embeddings, tunable constants, not a
 * calibrated model. Feedback is plain statement only (product principle 1: no praise, no
 * pressure).
 * Main exports: gradeConceptGuess, guessFeedbackMessage, ConceptGuessGrade,
 * CORRECT_COSINE_THRESHOLD, CLOSE_COSINE_THRESHOLD.
 */
import type { CopyMessage } from "@breadcrumb/core-i18n";

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

/** Plain-statement feedback for a graded concept guess (no praise, no pressure) — which of
 * the three lines applies; the app writes it (spec 058 §2). */
export function guessFeedbackMessage(grade: ConceptGuessGrade, summary: string): CopyMessage {
  const params = { summary };
  switch (grade) {
    case "correct":
      return { key: "learning:door.guessCorrect", params };
    case "close":
      return { key: "learning:door.guessClose", params };
    case "wrong":
      return { key: "learning:door.guessWrong", params };
  }
}
