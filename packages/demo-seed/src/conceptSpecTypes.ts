/**
 * Purpose: the shared shape and domain roots for the demo seed's 24 knowledge-node specs
 * (spec 035 T7b) — split from the per-bucket spec lists so each stays under the file-size
 * budget.
 * Main exports: ConceptSpec, ASTRO_ROOT, JS_ROOT.
 */
import type { Domain } from "./shared";

export const ASTRO_ROOT = "天文观测基础";
export const JS_ROOT = "JavaScript核心机制";

export interface ConceptSpec {
  label: string;
  domain: Domain;
  /** null = a tree root; otherwise the label of this domain's root node. */
  parentLabel: string | null;
  summary: string;
  /** Sighting instants, days before `now` — encodes the three buckets by construction:
   * ~5 spaced sightings ending recently (settled/mastered), one old sighting past the FSRS
   * ~65-day decay point (waiting for reunion), or one sighting inside the last two weeks
   * (freshly met). Verified against the real computeNodeRetention curve (see spec 035 T7b
   * seeding notes) rather than guessed — the stock (unfitted) FSRS scheduler decays much
   * slower than intuition suggests, so "waiting" nodes need a single ~9-11 week-old sighting
   * rather than 2-3 within the last month to actually cross the 0.6 threshold. */
  offsetsDays: readonly number[];
}
