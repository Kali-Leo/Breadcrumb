/**
 * Purpose: choosing what active recall (spec 053 §4) goes looking for. Terms come from two
 * origins and no others — the fields the first-run panel offered, weighted by the reader's own
 * signals and sampled by Thompson for the ones worth testing, and words pulled locally out of
 * what they actually read. Successive restocks enter the list at different places, so a day's
 * queries are spread over the reader's interests instead of being spent on the first one every
 * time. Pure: no network, no database, no LLM.
 * Main exports: selectRecallTerms, RecallTermInput.
 */
import type { DiscoveryCardRow, DiscoveryEventRow } from "@breadcrumb/core-db";
import {
  foldInterestFromEvents,
  pickExploreTopics,
  topicStatsFromEvents,
} from "@breadcrumb/plugin-discovery";
import { extractSalientKeywords } from "./discoveryKeywords";
import { ONBOARDING_FIELDS } from "./discoveryOnboarding";
import { discoveryRowsToInterestEvents } from "./discoveryOrdering";

/** How many of the reader's recently read items the keyword pass looks at. */
const READ_ITEMS_FOR_KEYWORDS = 20;

/** How many terms the rotation cycles through, and how many candidates each origin offers before
 * hygiene and the ring cut them down. About a day's worth of queries: a term further down the
 * list than that would wait days for its turn, by which time the reader's list has moved on. */
const TERM_RING_SIZE = 12;

/**
 * Anything that reads as an address rather than as a subject, whichever list proposed it. A card's
 * title and hook are text a stranger wrote and they feed the keyword pass, so this is the last
 * line as well as the first: what the reader subscribes to, and any address a feed plants in its
 * text, must not travel to a third-party search API (spec 053 T9 finding #1).
 */
const ADDRESS_SHAPED: readonly RegExp[] = [
  /https?:/i,
  /^[a-z][a-z0-9+.-]*:/i,
  /\/\//,
  /^www\./i,
  /\.[a-z]{2,}(\/|$)/i,
  /@/,
];

function looksLikeAddress(term: string): boolean {
  return ADDRESS_SHAPED.some((pattern) => pattern.test(term));
}

/**
 * The topic labels allowed to become a query. Cards are filed under the channel that published
 * them — a display name, or the hostname of a feed the reader pasted in — and none of that is a
 * subject, nor ours to hand out. What is left is the vocabulary the first-run panel offered,
 * whatever the reader answered it with, and the terms that already went out and came back with
 * cards (a recalled card carries the term that found it as its topic).
 */
function allowedTopicVocabulary(input: RecallTermInput): Set<string> {
  const allowed = new Set<string>(ONBOARDING_FIELDS);
  for (const event of input.events) {
    if (event.kind === "onboarding") allowed.add(event.topic_label);
  }
  for (const card of input.cards) {
    if (card.source === "nearby") allowed.add(card.topic_label);
  }
  return allowed;
}

/** Round-robins the three sources of terms so a single strong interest cannot take every
 * query: familiar topic, then a word from what they read, then a topic worth testing. */
function roundRobin(lists: readonly (readonly string[])[], limit: number): string[] {
  const picked: string[] = [];
  const seen = new Set<string>();
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let index = 0; index < longest && picked.length < limit; index += 1) {
    for (const list of lists) {
      const term = list[index]?.trim();
      if (term === undefined || term.length === 0 || seen.has(term)) continue;
      seen.add(term);
      picked.push(term);
      if (picked.length >= limit) break;
    }
  }
  return picked;
}

/** Where this restock enters the term list. Always starting at the front is what let one
 * interest have the whole day: at three queries a restock, the reader's second and third
 * interests were never reached (spec 053 F1 handoff). */
function rotate(terms: readonly string[], cursor: number, limit: number): string[] {
  if (terms.length === 0 || limit <= 0) return [];
  const start = cursor % terms.length;
  const picked: string[] = [];
  for (let offset = 0; offset < terms.length && picked.length < limit; offset += 1) {
    const term = terms[(start + offset) % terms.length];
    if (term !== undefined) picked.push(term);
  }
  return picked;
}

export interface RecallTermInput {
  events: readonly DiscoveryEventRow[];
  /** The pool, used to look up the titles and hooks of what the reader read, and to recognize the
   * terms earlier restocks already sent. */
  cards: readonly DiscoveryCardRow[];
  nowIso: string;
  /** How many terms have been spent since the rotation began; the list is entered there. */
  cursor?: number;
  /** Injected in tests; production uses Math.random for Thompson's draws. */
  random?: () => number;
}

/** The terms this refill should search for, best first from where the rotation stands. */
export function selectRecallTerms(input: RecallTermInput, limit: number): string[] {
  const events = discoveryRowsToInterestEvents(input.events);
  const allowedTopics = allowedTopicVocabulary(input);
  const favouredTopics = foldInterestFromEvents(events, input.nowIso)
    .filter((weight) => weight.weight > 0)
    .map((weight) => weight.topicLabel)
    .filter((topicLabel) => allowedTopics.has(topicLabel));
  const exploreTopics = pickExploreTopics(
    topicStatsFromEvents(events),
    TERM_RING_SIZE,
    input.random ?? Math.random,
  ).filter((topicLabel) => allowedTopics.has(topicLabel));

  const readCardIds = new Set(
    input.events
      .filter((event) => ["open", "save", "finish"].includes(event.kind))
      .map((event) => event.card_id),
  );
  const readDocuments = input.cards
    .filter((card) => readCardIds.has(card.id))
    .slice(0, READ_ITEMS_FOR_KEYWORDS)
    .map((card) => `${card.title} ${card.hook}`);
  const keywords = extractSalientKeywords(readDocuments, TERM_RING_SIZE);

  const ring = roundRobin([favouredTopics, keywords, exploreTopics], TERM_RING_SIZE).filter(
    (term) => !looksLikeAddress(term),
  );
  return rotate(ring, input.cursor ?? 0, limit);
}
