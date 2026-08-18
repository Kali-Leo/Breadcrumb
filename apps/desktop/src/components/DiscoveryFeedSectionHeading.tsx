/**
 * Purpose: a line of text laid across the whole width of the feed, between two rows of cards
 * (spec 054 §(c)) — the way to break a long wall of identical boxes without drawing anything.
 *
 * Whitespace and a word, nothing else: no rule, no border, no panel, no shadow. M3 separates
 * explicit grouping (outlines, dividers, elevation) from implicit grouping (nearness and space)
 * and a feed of cards that already sit on one plane should group implicitly, or the page gains a
 * second visual system competing with the cards.
 *
 * Not on screen yet: this is the slot, and what belongs in it — what the sections are and where
 * they fall — is a decision about the feed's ordering, not about its layout.
 * Main exports: DiscoveryFeedSectionHeading.
 */
import type { ReactNode } from "react";

export function DiscoveryFeedSectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="col-span-full mt-4 mb-1 font-medium text-sm text-stone-500">{children}</h2>;
}
