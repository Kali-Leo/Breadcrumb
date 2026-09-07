/**
 * Purpose: the shared shape and domain roots for the demo seed's 39 knowledge-node specs —
 * split from the per-bucket spec lists so each stays under the file-size budget.
 *
 * A spec carries no words: its label and summary are looked up by `id` in the language the
 * reader is using (see text/demoText.ts). Relationships are ids too, so translating the demo
 * cannot change the tree's shape by accident.
 * Main exports: ConceptSpec, ASTRO_ROOT, JS_ROOT.
 */

import type { Domain } from "./shared";
import type { ConceptId } from "./text/demoText";

export const ASTRO_ROOT = "astro-root" satisfies ConceptId;
export const JS_ROOT = "js-root" satisfies ConceptId;

export interface ConceptSpec {
  id: ConceptId;
  domain: Domain;
  /** null = a tree root; otherwise the id of this node's parent. */
  parentId: ConceptId | null;
  /** Sighting instants, days before `now` — encodes the three buckets by construction:
   * ~5 spaced sightings ending recently (settled/mastered), one old sighting past the FSRS
   * ~65-day decay point (waiting for reunion), or one sighting inside the last two weeks
   * (freshly met). Verified against the real computeNodeRetention curve rather than
   * guessed — the stock (unfitted) FSRS scheduler decays much
   * slower than intuition suggests, so "waiting" nodes need a single ~9-11 week-old sighting
   * rather than 2-3 within the last month to actually cross the 0.6 threshold. */
  offsetsDays: readonly number[];
}
