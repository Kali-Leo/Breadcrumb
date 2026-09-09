/**
 * Purpose: the mechanical anchor gate — the one check in the fact-check path that does not
 * take the model's word for anything. A judge that answers `supported` or `contradicted` has
 * to copy the decisive sentence out of the evidence verbatim; this file reduces that quote and
 * the evidence to the same form and asks whether the quote really is in there. Where it is not,
 * the verdict is downgraded to `insufficient`.
 *
 * Why it is worth a file of its own: the failure this catches is the worst one the feature
 * has — the judge writes "资料显示 X" about a sentence no source contains, and the learner is
 * handed a fabrication with a citation under it. Asking the model to be honest does not fix
 * that; a substring check does, whatever the model intended.
 *
 * The comparison ignores whitespace entirely rather than merely folding runs of it, and that
 * is a measured decision, not a convenience: asked to copy 「…海拔8848.86米。」 a model reliably
 * writes 「…海拔 8848.86 米。」, and a rule that called that a fabrication refused correct
 * verdicts in bulk (see the numbers in the run this landed with). Ignoring whitespace cannot
 * turn a wrong quote into a passing one — every non-space character still has to appear, in
 * order, in one passage — so the gate keeps its whole strength and stops punishing typography.
 * Nothing beyond whitespace and Unicode NFC is normalised; anything more would be accepting a
 * rewrite, which is exactly what the gate exists to refuse.
 * Main exports: foldEvidenceText, anchorKey, quoteIsGrounded, gateVerdict, MIN_ANCHOR_CHARS.
 */
import type { EvidenceItem } from "./evidence/provider";
import type { VerdictRelationship } from "./verdict";

/** The fence literals buildVerdictMessages wraps each excerpt in. Stripped from the material
 * before it goes into the prompt (so it cannot forge a section break) and therefore stripped
 * here too: the gate has to compare against the text the model was actually shown. */
const DELIMITER_PATTERN = /<<<|>>>/g;

/**
 * One evidence excerpt as the model sees it: fence literals removed, every run of whitespace
 * folded to one space, NFC. Used for BOTH sides of the comparison, which is what makes
 * "逐字" checkable without also making it brittle about line wrapping.
 */
export function foldEvidenceText(text: string): string {
  return text.replace(DELIMITER_PATTERN, " ").replace(/\s+/g, " ").trim().normalize("NFC");
}

/**
 * Shortest quote the gate will accept, counted in non-whitespace characters. A two-character
 * fragment is a substring of almost any passage, so a gate without a floor would pass anything
 * that copied a comma. Eight characters is a phrase in a hanzi passage and roughly a word and a
 * half in an alphabetic one — short enough that a real quote never trips it.
 */
export const MIN_ANCHOR_CHARS = 8;

/** The form both sides of the comparison are reduced to: fences gone, whitespace gone, NFC. */
export function anchorKey(text: string): string {
  return text.replace(DELIMITER_PATTERN, "").replace(/\s+/g, "").normalize("NFC");
}

/** True when `quote` occurs in at least one passage, character for character, ignoring only
 * whitespace. */
export function quoteIsGrounded(quote: string, evidence: readonly EvidenceItem[]): boolean {
  const key = anchorKey(quote);
  if (key.length < MIN_ANCHOR_CHARS) return false;
  return evidence.some((item) => anchorKey(item.snippet).includes(key));
}

/** A judge's answer, in the only two fields the gate looks at. */
export interface GateableVerdict {
  relationship: VerdictRelationship;
  /** What the judge copied out of the evidence; the empty string when it copied nothing. */
  quote: string;
}

export interface GatedVerdict {
  relationship: VerdictRelationship;
  /** True when a decided verdict was turned into `insufficient` because its quote was not in
   * the evidence — the caller must then drop the judge's own sentence, which is about a
   * verdict that no longer stands. */
  downgraded: boolean;
}

/**
 * The gate itself. `insufficient` passes through untouched (there is nothing to ground), and
 * a decided verdict survives only if its quote is really in the material.
 */
export function gateVerdict(
  verdict: GateableVerdict,
  evidence: readonly EvidenceItem[],
): GatedVerdict {
  if (verdict.relationship === "insufficient") {
    return { relationship: "insufficient", downgraded: false };
  }
  if (quoteIsGrounded(verdict.quote, evidence)) {
    return { relationship: verdict.relationship, downgraded: false };
  }
  return { relationship: "insufficient", downgraded: true };
}
