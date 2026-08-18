/**
 * Purpose: the active half of candidate recall (spec 053 §4) — spends a few search terms, within
 * a daily query budget, on the channels that answer queries. Which terms those are is decided
 * next door (discoveryRecallTerms); this file owns the budget row: how many queries the day has
 * left and how far the rotation through the reader's terms has got, both of which survive a
 * restart. No LLM is involved at any step.
 * Side effects: the daily budget row in settings, network requests via discoveryChannels.
 * Main exports: runActiveRecall, recallRanToday, DAILY_RECALL_QUERY_BUDGET.
 */
import { z } from "zod";
import { getRepos } from "./db";
import { localDayKey } from "./discoveryChannelState";
import { searchChannelsForCandidates, type TopicSearchHarvest } from "./discoveryChannels";
import { selectRecallTerms } from "./discoveryRecallTerms";
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

const RECALL_BUDGET_KEY = "discoveryRecallBudget";

/** Comes back from the settings table, so it is parsed rather than trusted; anything unreadable
 * simply means "nothing spent yet today". A row written before the rotation existed carries no
 * cursor and starts at the front of the list, which is where it left off. */
const recallBudgetSchema = z.object({
  day: z.string().min(1),
  used: z.number().int().min(0),
  cursor: z.number().int().min(0).default(0),
});

type RecallBudget = z.infer<typeof recallBudgetSchema>;

async function readBudget(day: string): Promise<RecallBudget> {
  const repos = await getRepos();
  const stored = await repos.settings.get<unknown>(RECALL_BUDGET_KEY);
  const parsed = recallBudgetSchema.safeParse(stored);
  if (!parsed.success) return { day, used: 0, cursor: 0 };
  // A new day gives the reader their queries back; where the rotation had got to is not a daily
  // thing, so it carries over rather than sending every morning after the same first term.
  if (parsed.data.day !== day) return { day, used: 0, cursor: parsed.data.cursor };
  return parsed.data;
}

async function spendQueries(day: string, count: number): Promise<void> {
  const repos = await getRepos();
  const budget = await readBudget(day);
  await repos.settings.set(
    RECALL_BUDGET_KEY,
    { day, used: budget.used + count, cursor: budget.cursor + count },
    nowIso(),
  );
}

export interface ActiveRecallOutcome {
  harvests: TopicSearchHarvest[];
  queriesSpent: number;
}

/**
 * Whether today's budget row has been written at all — which is to say whether anything was
 * actually asked since the day turned over. The refill next door uses it to make sure a day gets
 * one round of looking for the reader's own subjects even when the pool is full enough that
 * nothing else would ask for one (spec 053 T10). A day where the library had no term to offer
 * stays untouched, so the first restock after the reader gives it one runs the round.
 */
export async function recallRanToday(now: Date): Promise<boolean> {
  const repos = await getRepos();
  const stored = await repos.settings.get<unknown>(RECALL_BUDGET_KEY);
  const parsed = recallBudgetSchema.safeParse(stored);
  return parsed.success && parsed.data.day === localDayKey(now);
}

/**
 * Runs one round of active recall. Returns nothing at all — with no queries spent — when the
 * day's budget is gone or the reader's history says nothing yet; the passive polling layer is
 * what fills the pool in that case.
 *
 * A round that found nothing to ask about does NOT mark the day as asked. It used to, and on a
 * fresh install that turned the day's one guaranteed round into no round at all (spec 053 T10b):
 * the restock that runs a few seconds after launch happens before the reader has answered the
 * first-run panel, so there is not one term in the library, and marking the day spent there meant
 * every later restock of that day skipped recall — including the one right after the reader said
 * what they wanted to see. Nothing was asked, so nothing is written down, and the next restock
 * asks again.
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
  const terms = selectRecallTerms(
    { events, cards, nowIso: now.toISOString(), cursor: budget.cursor },
    allowance,
  );
  if (terms.length === 0) return { harvests: [], queriesSpent: 0 };

  const harvests = await searchChannelsForCandidates(terms, { now: () => now });
  await spendQueries(day, terms.length);
  return { harvests, queriesSpent: terms.length };
}
