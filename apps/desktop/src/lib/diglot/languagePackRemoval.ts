/**
 * Purpose: what removing a downloaded language pack entails, written against a small set of
 * hand-offs so the order of operations can be tested without the store: the bundled pair is
 * never removed; a pair still in use is first swapped for the bundled one (the learner keeps
 * weaving, in the language that needs no download) and only then deleted; the installed list
 * is re-read from storage afterwards so the picker offers the pair for download again.
 * Word states are untouched — re-downloading picks up where the learner left off.
 * Main exports: removePairWith, PackRemovalHandoffs, PackRemovalOutcome.
 */
import { BUNDLED_PAIR_ID } from "./languagePacks";

export interface PackRemovalHandoffs {
  currentPairId(): string;
  /** Switches the weave to another installed pair (persisting the choice). */
  switchPair(pairId: string): Promise<void>;
  removePack(pairId: string): Promise<void>;
  listInstalled(): Promise<string[]>;
  setInstalled(pairs: string[]): void;
}

export interface PackRemovalOutcome {
  removed: boolean;
  /** True when the removed pair was the one in use, so the weave now runs on the bundled pair. */
  switchedToBundled: boolean;
}

export async function removePairWith(
  handoffs: PackRemovalHandoffs,
  pairId: string,
): Promise<PackRemovalOutcome> {
  if (pairId === BUNDLED_PAIR_ID) return { removed: false, switchedToBundled: false };
  const switchedToBundled = handoffs.currentPairId() === pairId;
  // Switch before deleting: the store reloads the pack for the new pair, and the old pack
  // must still be readable until nothing points at it.
  if (switchedToBundled) await handoffs.switchPair(BUNDLED_PAIR_ID);
  await handoffs.removePack(pairId);
  handoffs.setInstalled(await handoffs.listInstalled());
  return { removed: true, switchedToBundled };
}
