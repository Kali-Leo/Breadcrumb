/**
 * Purpose: the guaranteed share of the feed that goes to territory the reader has no history in
 * (spec 053 §4's 探索位保底, and §6's 熟悉的多一点｜新领域多一点 dial, which sets the share).
 * A ranked list alone cannot do this: the best-scoring items are by construction the familiar
 * ones, so unfamiliar items are placed by position rather than by score. Pure list math, no DB,
 * no I/O.
 * Main exports: defaultExplorationShare, explorationShareBounds, interleaveExploration.
 */

/** What the feed does before the reader ever touches the dial: one card in four comes from
 * somewhere they have no history with. Matches the 10-25% floor the spec asks for, at the top
 * of that range — the page exists to find out what the reader likes, and a feed that only
 * repeats itself cannot find anything out. */
export const defaultExplorationShare = 0.25;

/** The dial's travel. Never 0 (a feed that stops exploring stops learning about the reader) and
 * never past half (the reader came for what they came for). */
export const explorationShareBounds = { minimum: 0.1, maximum: 0.5 } as const;

function clampShare(share: number): number {
  if (!Number.isFinite(share)) return defaultExplorationShare;
  return Math.min(1, Math.max(0, share));
}

/**
 * Lays the two already-ranked lists into one sequence in which `share` of the positions belong
 * to the exploration list, spread evenly rather than clumped at one end: with a share of 0.25
 * every fourth card is an exploration card, so the reader meets something new while scrolling
 * instead of hitting a block of unfamiliar cards after the familiar ones run out.
 *
 * Positions are handed to whichever list still has items when the other has run dry, so a
 * reader with no history (everything is exploration) and a reader whose pool happens to hold
 * nothing new both get a full page.
 */
export function interleaveExploration<T>(
  exploit: readonly T[],
  explore: readonly T[],
  share: number = defaultExplorationShare,
): T[] {
  const clamped = clampShare(share);
  const merged: T[] = [];
  let exploitIndex = 0;
  let exploreIndex = 0;
  let position = 0;
  const total = exploit.length + explore.length;

  while (merged.length < total) {
    // Bresenham-style: the position takes an exploration item exactly when the running quota
    // crosses the next whole number, which spreads them as evenly as integers allow.
    const quotaCrossed =
      Math.floor((position + 1) * clamped) > Math.floor(position * clamped) &&
      exploreIndex < explore.length;
    const takeExplore = quotaCrossed || exploitIndex >= exploit.length;
    const item =
      takeExplore && exploreIndex < explore.length
        ? explore[exploreIndex++]
        : exploit[exploitIndex++];
    if (item === undefined) break;
    merged.push(item);
    position += 1;
  }
  return merged;
}
