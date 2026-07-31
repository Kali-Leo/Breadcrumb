/**
 * Purpose: generic array helpers mirroring the Haxe static-extension methods used by town code.
 * Ported from watabou's TownGeneratorOS (GPL-3.0) Source/com/watabou/utils/ArrayExtender.hx.
 * Main exports: last, contains, remove, min, max, random, shuffle, weighted, every, copy.
 */

import { townRandom } from "./townRandom";

function townRandomFloat(): number {
  return townRandom.float();
}

/** Returns the last element, or undefined for an empty array (as in the Haxe JS target). */
export function last<T>(a: readonly T[]): T | undefined {
  return a[a.length - 1];
}

/** Identity containment check (Haxe indexOf semantics). */
export function contains<T>(a: readonly T[], value: T): boolean {
  return a.indexOf(value) !== -1;
}

/** Removes the first occurrence of the value; returns whether anything was removed. */
export function remove<T>(a: T[], value: T): boolean {
  const index = a.indexOf(value);
  if (index === -1) {
    return false;
  }
  a.splice(index, 1);
  return true;
}

/** Returns the element with the smallest measure (first vertex wins ties, as in Haxe). */
export function min<T>(a: readonly T[], measure: (element: T) => number): T {
  const first = a[0];
  if (first === undefined) {
    throw new Error("min() on an empty array");
  }
  let result = first;
  let minMeasure = measure(result);
  for (let i = 1; i < a.length; i++) {
    const element = a[i];
    if (element === undefined) {
      continue;
    }
    const elementMeasure = measure(element);
    if (elementMeasure < minMeasure) {
      result = element;
      minMeasure = elementMeasure;
    }
  }
  return result;
}

/** Returns the element with the largest measure (first vertex wins ties, as in Haxe). */
export function max<T>(a: readonly T[], measure: (element: T) => number): T {
  const first = a[0];
  if (first === undefined) {
    throw new Error("max() on an empty array");
  }
  let result = first;
  let maxMeasure = measure(result);
  for (let i = 1; i < a.length; i++) {
    const element = a[i];
    if (element === undefined) {
      continue;
    }
    const elementMeasure = measure(element);
    if (elementMeasure > maxMeasure) {
      result = element;
      maxMeasure = elementMeasure;
    }
  }
  return result;
}

/** Picks a uniformly random element using the given (or town) uniform source. */
export function random<T>(a: readonly T[], randomFloat: () => number = townRandomFloat): T {
  const element = a[Math.trunc(randomFloat() * a.length)];
  if (element === undefined) {
    throw new Error("random() on an empty array");
  }
  return element;
}

/** Returns a new array with elements inserted at random positions (Haxe shuffle). */
export function shuffle<T>(a: readonly T[], randomFloat: () => number = townRandomFloat): T[] {
  const result: T[] = [];
  for (const element of a) {
    result.splice(Math.trunc(randomFloat() * (result.length + 1)), 0, element);
  }
  return result;
}

/** Picks an element with probability proportional to its weight (falls back to a[0]). */
export function weighted<T>(
  a: readonly T[],
  weights: readonly number[],
  randomFloat: () => number = townRandomFloat,
): T {
  let total = 0;
  for (const w of weights) {
    total += w;
  }
  const z = randomFloat() * total;
  let acc = 0;
  for (let i = 0; i < a.length; i++) {
    const element = a[i];
    if (element === undefined) {
      continue;
    }
    acc += weights[i] ?? 0;
    if (z <= acc) {
      return element;
    }
  }
  const first = a[0];
  if (first === undefined) {
    throw new Error("weighted() on an empty array");
  }
  return first;
}

/** True when the predicate holds for every element. */
export function every<T>(a: readonly T[], test: (element: T) => boolean): boolean {
  for (const element of a) {
    if (!test(element)) {
      return false;
    }
  }
  return true;
}

/** Shallow copy (Haxe Array.copy). */
export function copy<T>(a: readonly T[]): T[] {
  return a.slice();
}
