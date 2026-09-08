/**
 * Purpose: the second scenario source — the app's canonical concept table (804 curriculum
 * concepts across Chinese school mathematics and the English web-development syllabus, each
 * with the reference it was verified against). It supplies the two things demo-seed cannot:
 * knowledge trees big enough to be realistic, and alias pairs with an authority behind them.
 *
 * An alias in that table is a name the SAME concept is also published under (Wikidata label
 * and alias, normalised-equal), so `label` versus `alias` is a hand-verified "same concept"
 * for the alignment judge, and two different entries are a "different" — ground truth that
 * needs no reference model.
 *
 * The import reaches into apps/desktop because that is where the generated table lives and
 * simlab is dev-only tooling that nothing ships (see this package's description). No product
 * package may do this.
 *
 * Main exports: canonicalLabels, canonicalAliasPairs, canonicalDistinctPairs, CanonicalScript.
 */
import { CANONICAL_CONCEPTS } from "../../../../apps/desktop/src/data/generated/canonicalConcepts";

/** Which half of the table an entry belongs to — the maths syllabus is written in Chinese,
 * the web syllabus in English, and mixing the two inside one prompt would measure a model's
 * tolerance for mixed-language input rather than its grasp of the material. */
export type CanonicalScript = "hanzi" | "latin";

const HAS_CJK = /[㐀-鿿]/;

function scriptOf(label: string): CanonicalScript {
  return HAS_CJK.test(label) ? "hanzi" : "latin";
}

/** Concept labels in one script, in table order (which is syllabus order, not alphabetical —
 * so a slice of it is a plausible stretch of somebody's tree rather than a random bag). */
export function canonicalLabels(script: CanonicalScript): string[] {
  return CANONICAL_CONCEPTS.filter((concept) => scriptOf(concept.label) === script).map(
    (concept) => concept.label,
  );
}

export interface AliasPair {
  /** The concept as the syllabus names it. */
  label: string;
  /** Another published name for the same concept. */
  alias: string;
  /** Where the equivalence was verified — carried into the prompt as the item's provenance,
   * exactly as the real compare pipeline does. */
  sourceRef: string;
  script: CanonicalScript;
}

/**
 * Every concept that publishes at least one alias, paired with its first one. Aliases whose
 * script differs from the label's are dropped: "集合"/"set" is a translation, and asking the
 * judge to call a translation the same concept is a different question from the one the
 * compare pipeline asks.
 */
export function canonicalAliasPairs(script: CanonicalScript): AliasPair[] {
  const pairs: AliasPair[] = [];
  for (const concept of CANONICAL_CONCEPTS) {
    if (scriptOf(concept.label) !== script) continue;
    const alias = concept.aliases.find(
      (candidate) => scriptOf(candidate) === script && candidate !== concept.label,
    );
    if (alias === undefined) continue;
    pairs.push({ label: concept.label, alias, sourceRef: concept.sourceRef, script });
  }
  return pairs;
}

export interface DistinctPair {
  /** An alias of one concept... */
  alias: string;
  sourceRef: string;
  /** ...set against a DIFFERENT concept's label. */
  otherLabel: string;
  script: CanonicalScript;
}

/**
 * Negative pairs for the alignment judge: one concept's alias against another concept's
 * label. Offset by a fixed stride rather than a random draw so the set is identical on every
 * machine; the stride is a prime so the pairing does not fall into a short cycle.
 */
export function canonicalDistinctPairs(script: CanonicalScript): DistinctPair[] {
  const aliasPairs = canonicalAliasPairs(script);
  const stride = 7;
  const distinct: DistinctPair[] = [];
  aliasPairs.forEach((pair, index) => {
    const other = aliasPairs[(index + stride) % aliasPairs.length];
    // A table too short for the stride to move anywhere would pair a concept with itself,
    // which is the opposite of what this list is for.
    if (other === undefined || other.label === pair.label) return;
    distinct.push({
      alias: pair.alias,
      sourceRef: pair.sourceRef,
      otherLabel: other.label,
      script,
    });
  });
  return distinct;
}
