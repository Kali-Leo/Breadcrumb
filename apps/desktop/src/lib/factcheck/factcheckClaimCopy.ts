/**
 * Purpose: the sentence under a checked claim when no judge wrote one. feature-factcheck
 * leaves `reasoning` empty for every outcome it decided by itself, because a headless package
 * holds no wording (spec 058 §2); this turns that empty string back into a catalogue key,
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
 * The three system outcomes are told apart by fields that were already being stored, so no
 * marker column was needed:
 *  - `unavailable`               → the search never got out
 *  - `insufficient`, no evidence → the search completed and turned up nothing
 *  - `insufficient`, evidence    → the judging call itself failed
 */
export function claimReasoningKey(claim: ClaimOutcome): string | null {
  if (claim.reasoning.length > 0) return null;
  if (claim.relationship === "unavailable") return "factcheck.unavailableNextStep";
  if (claim.relationship === "insufficient") {
    return claim.evidenceCount === 0
      ? "factcheck.noEvidenceReasoning"
      : "factcheck.verdictFailedReasoning";
  }
  // A verdict the judge did produce always carries reasoning (the schema demands min(1)), so
  // there is no sentence to invent here.
  return null;
}
