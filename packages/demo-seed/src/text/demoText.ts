/**
 * Purpose: the shape of everything the demo learner *says*, kept apart from everything the
 * demo learner *is*. The seed's structure — 39 nodes, who is whose parent, how many days ago
 * each was met, which claims exist — lives in the spec files and is identical in every
 * language. Only the words change.
 *
 * Why a per-language dataset here rather than keys in apps/desktop/src/locales: this is
 * fixture data, not interface copy. It is read once, by the seeder, and never by a screen; it
 * has to work from the dev CLI, which has no i18next; and a `Record<ConceptId, …>` makes a
 * missing node a type error instead of a runtime hole — the interface catalogues get the same
 * guarantee only from a test. Keeping it out of the catalogues also keeps ~100 strings out of
 * the bundle every reader downloads at startup for a fixture most of them never install.
 *
 * Main exports: ConceptId, CONCEPT_IDS, DemoText.
 */

/** Every node in the demo landscape, by a stable id. The id is what the spec files, the
 * claims and the conversation references all point at, so a label can be rewritten in any
 * language without touching a single relationship. */
export const CONCEPT_IDS = [
  "astro-root",
  "stellar-spectra",
  "js-root",
  "parallax",
  "closures",
  "transits",
  "event-loop",
  "promise-chains",
  "event-horizon",
  "async-await",
  "tidal-locking",
  "prototype-chain",
  "kepler-laws",
  "destructuring",
  "magnitude-scale",
  "array-higher-order",
  "gravitational-lensing",
  "debounce-throttle",
  "white-dwarf",
  "es-modules",
  "neutron-star",
  "recursion-call-stack",
  "cmb",
  "regex-capture-groups",
  "array-map",
  "array-filter",
  "array-reduce",
  "method-chaining",
  "sparse-arrays",
  "predicate-functions",
  "truthiness",
  "accumulator-pattern",
  "reduce-initial-value",
  "map-via-reduce",
  "group-by",
  "object-accumulator",
  "lazy-evaluation-tradeoff",
  "composing-predicates",
  "map-or-object",
] as const;

export type ConceptId = (typeof CONCEPT_IDS)[number];

/** A node's name and its one-line summary, in that order. */
export type ConceptWords = readonly [label: string, summary: string];

export interface DemoText {
  /** All 39 nodes. Missing one is a type error, which is the point of the union. */
  concepts: Record<ConceptId, ConceptWords>;
  titles: {
    astro: string;
    js: string;
    teach: string;
    vocab: string;
  };
  /** Six turns, learner first, alternating. The 2nd, 3rd and 5th are what today's sightings
   * of gravitational lensing, stellar spectra and the astronomy root attach to. */
  astroMessages: readonly [string, string, string, string, string, string];
  /** Four turns; the 1st is what today's sighting of the JavaScript root attaches to. */
  jsMessages: readonly [string, string, string, string];
  /** The learner explains closures, and gets one plain response. */
  teachMessages: readonly [string, string];
  vocabMessages: readonly [string, string, string, string];
  /** Three sentences a vocabulary word was met in. `{word}` is replaced with the word. */
  wordContexts: readonly [string, string, string];
}
