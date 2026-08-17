/**
 * Purpose: the active half of candidate recall (spec 053 §4) — turns what the reader has shown
 * interest in into a few search terms and spends them, within a daily query budget, on the
 * channels that answer queries. Terms come from three places: the topics their signals already
 * favour (first-run stances included, since those fold into the same weights), the topics
 * Thompson sampling wants to test, and words pulled locally out of what they actually read.
 * No LLM is involved at any step.
 * Side effects: the daily budget row in settings, network requests via discoveryChannels.
 * Main exports: selectRecallTerms, runActiveRecall, DAILY_RECALL_QUERY_BUDGET.
 */
import type { DiscoveryCardRow, DiscoveryEventRow } from "@breadcrumb/core-db";
import {
  foldInterestFromEvents,
  pickExploreTopics,
  topicStatsFromEvents,
} from "@breadcrumb/plugin-discovery";
import { z } from "zod";
import { getRepos } from "./db";
import { localDayKey } from "./discoveryChannelState";
import { searchChannelsForCandidates, type TopicSearchHarvest } from "./discoveryChannels";
import { extractSalientKeywords } from "./discoveryKeywords";
import { discoveryRowsToInterestEvents } from "./discoveryOrdering";
import { nowIso } from "./time";

/**
 * Queries a day may spend. Every channel this reaches is free and unauthenticated, so the
 * budget is about being a good guest rather than about money: a dozen queries is more than a
 * reader's interests actually move in a day, and it keeps our footprint on someone else's free
 * API well inside what they publish as reasonable.
 */
export const DAILY_RECALL_QUERY_BUDGET = 12;

/** At most this many terms per restock, so one refill cannot spend the whole day's budget. */
const TERMS_PER_REFILL = 3;

/** How many of the reader's recently read items the keyword pass looks at. */
const READ_ITEMS_FOR_KEYWORDS = 20;

const RECALL_BUDGET_KEY = "discoveryRecallBudget";

/** Comes back from the settings table, so it is parsed rather than trusted; anything unreadable
 * simply means "nothing spent yet today". */
const recallBudgetSchema = z.object({
  day: z.string().min(1),
  used: z.number().int().min(0),
});

type RecallBudget = z.infer<typeof recallBudgetSchema>;

async function readBudget(day: string): Promise<RecallBudget> {
  const repos = await getRepos();
  const stored = await repos.settings.get<unknown>(RECALL_BUDGET_KEY);
  const parsed = recallBudgetSchema.safeParse(stored);
  if (!parsed.success || parsed.data.day !== day) return { day, used: 0 };
  return parsed.data;
}

async function spendQueries(day: string, count: number): Promise<void> {
  const repos = await getRepos();
  const budget = await readBudget(day);
  await repos.settings.set(RECALL_BUDGET_KEY, { day, used: budget.used + count }, nowIso());
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

export interface RecallTermInput {
  events: readonly DiscoveryEventRow[];
  /** The pool, used only to look up the titles and hooks of what the reader read. */
  cards: readonly DiscoveryCardRow[];
  nowIso: string;
  /** Injected in tests; production uses Math.random for Thompson's draws. */
  random?: () => number;
}

/** The terms this refill should search for, best first. */
export function selectRecallTerms(input: RecallTermInput, limit: number): string[] {
  const events = discoveryRowsToInterestEvents(input.events);
  const favouredTopics = foldInterestFromEvents(events, input.nowIso)
    .filter((weight) => weight.weight > 0)
    .map((weight) => weight.topicLabel);
  const exploreTopics = pickExploreTopics(
    topicStatsFromEvents(events),
    limit,
    input.random ?? Math.random,
  );

  const readCardIds = new Set(
    input.events
      .filter((event) => ["open", "save", "finish"].includes(event.kind))
      .map((event) => event.card_id),
  );
  const readDocuments = input.cards
    .filter((card) => readCardIds.has(card.id))
    .slice(0, READ_ITEMS_FOR_KEYWORDS)
    .map((card) => `${card.title} ${card.hook}`);
  const keywords = extractSalientKeywords(readDocuments, limit);

  return roundRobin([favouredTopics, keywords, exploreTopics], limit);
}

export interface ActiveRecallOutcome {
  harvests: TopicSearchHarvest[];
  queriesSpent: number;
}

/**
 * Runs one round of active recall. Returns nothing at all — with no queries spent — when the
 * day's budget is gone or the reader's history says nothing yet; the passive polling layer is
 * what fills the pool in that case.
 */
export async function runActiveRecall(now: Date = new Date()): Promise<ActiveRecallOutcome> {
  const day = localDayKey(now);
  const budget = await readBudget(day);
  const allowance = Math.min(TERMS_PER_REFILL, DAILY_RECALL_QUERY_BUDGET - budget.used);
  if (allowance <= 0) return { harvests: [], queriesSpent: 0 };

  const repos = await getRepos();
  const [events, cards] = await Promise.all([
    repos.discovery.listAllEvents(),
    repos.discovery.listNewestCards(150),
  ]);
  const terms = selectRecallTerms({ events, cards, nowIso: now.toISOString() }, allowance);
  if (terms.length === 0) return { harvests: [], queriesSpent: 0 };

  const harvests = await searchChannelsForCandidates(terms, { now: () => now });
  await spendQueries(day, terms.length);
  return { harvests, queriesSpent: terms.length };
}
