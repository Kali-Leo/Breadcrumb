/**
 * Purpose: check one — the specific-value check. Every number, date and measurement an answer
 * states has to occur in the learner's own question or in the topic's passages; a figure that
 * appears nowhere but the reply was produced by the model, and the sentence carrying it is
 * marked as the model's own rather than as something the sources say.
 *
 * The detector is the product-side port of packages/simlab/src/judges/uncertaintyMarkers.ts's
 * `novelNumbers`, which measures the same property for the abstention ruler: a numeral the
 * prompt never showed is the mechanical stand-in for "pretending to know", and it needs no
 * answer key, no model and no network. Two things are added for product use:
 *  - the **unit** riding on the numeral, because "8848 米" and "8848 英尺" are different claims
 *    and the conflict detector needs to compare like with like;
 *  - the sources are searched with the anchor gate's own key (whitespace folded away), so
 *    "8,848.86 米" in a reply still finds "8848.86米" in a passage.
 *
 * Known limit, inherited and stated rather than hidden: only Arabic-Indic digits are seen. A
 * reply that invents 「大约三十万人」 in Chinese numerals is not caught by this check.
 * Main exports: SpecificValue, specificValues, ungroundedValues.
 */
import { anchorKey } from "../anchorGate";

export interface SpecificValue {
  /** The numeral as written, e.g. "8848.86" or "1953". */
  number: string;
  /** What immediately follows it, when it reads as a unit: "米", "km", "%", "" when none. */
  unit: string;
  /** number + unit, the form shown to a reader. */
  text: string;
}

/** List-item numbering is layout, not a claim: "1. " opening a line says nothing about the
 * world, so it is removed before numerals are collected. */
function stripListMarkers(text: string): string {
  return text.replace(/^[ \t>*-]*\d+[.)、]\s/gm, "");
}

/**
 * A numeral run, then its unit. A symbol or a CJK measure word may sit one space away
 * ("8848 米" and "8848米" are the same claim); Latin letters count as a unit only when they
 * abut the numeral ("50km"), because a space away is ordinary prose — "in 1953 the" would
 * otherwise be a figure measured in "the".
 *
 * A CJK unit is at most two characters AND must not be followed by more of them. Without that
 * last clause the greedy run ate the sentence: 「2020 年 12 月 8 日中国和尼泊尔共同宣布」 gave a
 * figure of 8 measured in 「日中国」. Where the characters after a numeral are just prose
 * continuing, the figure has no unit, which is the truth about a bare 8 in a date.
 */
const VALUE =
  /(\d+(?:[.,:/–-]\d+)*)(?:\s?([%°‰]|[\u3400-\u4dbf\u4e00-\u9fff]{1,2}(?![\u3400-\u4dbf\u4e00-\u9fff]))|([a-z]{1,6}))?/gi;

/** Characters that follow a numeral without being a unit — ordinal suffixes aside, a unit is
 * what makes two figures comparable, so a bare numeral simply carries an empty one. */
const NOT_A_UNIT = new Set(["st", "nd", "rd", "th", "e", "er", "de"]);

/** Every specific value the text states, de-duplicated, in order of first appearance. */
export function specificValues(text: string): SpecificValue[] {
  const found = new Map<string, SpecificValue>();
  for (const match of stripListMarkers(text).matchAll(VALUE)) {
    const number = match[1] ?? "";
    const rawUnit = match[2] ?? match[3] ?? "";
    const unit = NOT_A_UNIT.has(rawUnit.toLowerCase()) ? "" : rawUnit;
    const value: SpecificValue = { number, unit, text: `${number}${unit}` };
    if (!found.has(value.text)) found.set(value.text, value);
  }
  return [...found.values()];
}

/** True when `value`'s numeral occurs in the given text, whitespace and thousands separators
 * ignored — the same folding the anchor gate compares quotes under. */
export function valueOccursIn(value: SpecificValue, text: string): boolean {
  return anchorKey(text).replace(/,/g, "").includes(anchorKey(value.number).replace(/,/g, ""));
}

/**
 * The values a sentence states that neither the learner's question nor any passage contains.
 * An empty list is the passing case: everything specific in this sentence came from somewhere
 * the reader can see.
 */
export function ungroundedValues(
  sentence: string,
  question: string,
  passages: readonly string[],
): SpecificValue[] {
  const haystacks = [question, ...passages];
  return specificValues(sentence).filter(
    (value) => !haystacks.some((haystack) => valueOccursIn(value, haystack)),
  );
}
