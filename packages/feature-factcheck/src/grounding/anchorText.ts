/**
 * Purpose: reducing a quote and a passage to the one form they can be compared in, character
 * for character. Everything the grounding layer decides mechanically — does this sentence
 * really appear in the material, does this number really occur there, do two sources say
 * different things about the same value — rests on this reduction, and on nothing else.
 *
 * The comparison ignores whitespace entirely rather than merely folding runs of it, and that
 * is a measured decision, not a convenience: a model asked about 「…海拔8848.86米。」 reliably
 * writes 「…海拔 8848.86 米。」, and a rule that called that a mismatch refused correct
 * findings in bulk. Ignoring whitespace cannot turn a wrong quote into a passing one — every
 * non-space character still has to appear, in order, in one passage — so the check keeps its
 * whole strength and stops punishing typography. Nothing beyond whitespace and Unicode NFC is
 * normalised; anything more would be accepting a rewrite, which is exactly what this refuses.
 * Main exports: foldEvidenceText, anchorKey, quoteIsGrounded, MIN_ANCHOR_CHARS.
 */
import type { EvidenceItem } from "../evidence/provider";

/** The fence literals a passage block wraps each excerpt in. Stripped from the material
 * before it goes into the prompt (so it cannot forge a section break) and therefore stripped
 * here too: the comparison has to run against the text the model was actually shown. */
const DELIMITER_PATTERN = /<<<|>>>/g;

/**
 * One evidence excerpt as the model sees it: fence literals removed, every run of whitespace
 * folded to one space, NFC. Used for BOTH sides of a comparison, which is what makes
 * "逐字" checkable without also making it brittle about line wrapping.
 */
export function foldEvidenceText(text: string): string {
  return text.replace(DELIMITER_PATTERN, " ").replace(/\s+/g, " ").trim().normalize("NFC");
}

/**
 * Shortest quote a grounding check will accept, counted in non-whitespace characters. A
 * two-character fragment is a substring of almost any passage, so a check without a floor
 * would pass anything that copied a comma. Eight characters is a phrase in a hanzi passage and
 * roughly a word and a half in an alphabetic one — short enough that a real quote never trips
 * it.
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
