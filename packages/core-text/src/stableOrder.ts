/**
 * Purpose: a string order that is the same on every machine. `String.prototype.localeCompare`
 * with no locale argument asks the runtime for its default locale, so the same two labels can
 * come back in one order on a learner's laptop and the opposite order on a build server or in
 * another browser — which is how a tie-break turns into "the list looks different today".
 *
 * This compares by code unit instead, which the language specifies exactly. It is not
 * linguistically correct ordering for any language and is not meant to be: its only job is to
 * break a tie the same way everywhere, forever. Anything the reader is meant to read as sorted
 * needs a real collator with an explicit locale, not this.
 * Main exports: compareStable.
 */
export function compareStable(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
