/**
 * Purpose: the sentence under a checked claim when no judge wrote one. feature-factcheck
 * leaves `reasoning` empty for every outcome it decided by itself, because a headless package
 * holds no wording; this turns that empty string back into a catalogue key,
 * reading the outcome off the fields already stored.
 * Main exports: claimReasoningKey.
 */

/** Only the parts of a claim that decide which sentence applies. */
export interface ClaimOutcome {
  relationship: string;
  reasoning: string;
  evidenceCount: number;
}

/**
 * The `chat` catalogue key for a claim whose reasoning the pipeline left empty, or null when
 * the claim carries a judge's own sentence (including rows written before this split, which
 * still hold their original text and must keep showing it — no migration, no rewriting).
 *
 * The four system outcomes are told apart by the relationship and by whether any evidence is
 * in hand, so no marker column was needed:
 *  - `unavailable`               → the search never got out
 *  - `unanchored`                → the judge decided something the sources do not say in so
 *                                  many words, so the gate refused it. That is a fact about
 *                                  the sources, and the reader is told it as one — never as
 *                                  "这次没查成", which is about us.
 *  - `insufficient`, no evidence → the search completed and turned up nothing
 *  - `insufficient`, evidence    → the judging call did not come through
 */
export function claimReasoningKey(claim: ClaimOutcome): string | null {
  if (claim.reasoning.length > 0) return null;
  if (claim.relationship === "unavailable") return "factcheck.unavailableNextStep";
  if (claim.relationship === "unanchored") return "factcheck.unanchoredReasoning";
  if (claim.relationship === "insufficient") {
    return claim.evidenceCount === 0
      ? "factcheck.noEvidenceReasoning"
      : "factcheck.verdictFailedReasoning";
  }
  // A verdict the judge did produce always carries reasoning (the schema demands min(1)), so
  // there is no sentence to invent here.
  return null;
}
