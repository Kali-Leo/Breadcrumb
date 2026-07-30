/**
 * Purpose: local ports of ArrayExtender.hx helpers missing from the shared utils contract,
 * plus a guarded index accessor for noUncheckedIndexedAccess call sites.
 * Ported from watabou's TownGeneratorOS (GPL-3.0) Source/com/watabou/utils/ArrayExtender.hx.
 * Main exports: itemAt, replaceInArray, differenceOf, countMatching, addUnique.
 */

/** Returns the element at the index, throwing when the access is out of bounds. */
export function itemAt<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`Missing array item at index ${index}`);
  }
  return item;
}

/** ArrayExtender.replace: swaps one element for a run of replacements, in place. */
export function replaceInArray<T>(items: T[], element: T, replacements: readonly T[]): void {
  const index = items.indexOf(element);
  if (index === -1) {
    throw new Error("replaceInArray() element not found");
  }
  items.splice(index, 1, ...replacements);
}

/** ArrayExtender.difference: elements of a that are not present (by identity) in b. */
export function differenceOf<T>(a: readonly T[], b: readonly T[]): T[] {
  return a.filter((element) => b.indexOf(element) === -1);
}

/** ArrayExtender.count: number of elements passing the test. */
export function countMatching<T>(a: readonly T[], test: (element: T) => boolean): number {
  let count = 0;
  for (const element of a) {
    if (test(element)) {
      count++;
    }
  }
  return count;
}

/** ArrayExtender.add: pushes the element only when it is not already present. */
export function addUnique<T>(a: T[], element: T): void {
  if (a.indexOf(element) === -1) {
    a.push(element);
  }
}
