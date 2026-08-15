/**
 * Purpose: one-shot fetch of the tables the surviving mirror cards read (spec 035 → 048)
 * plus assembly of their view models via @breadcrumb/plugin-feedback's pure functions.
 * Main exports: FeedbackData, loadFeedbackData.
 */
import type { DiglotWordEventRow, DiglotWordStateRow } from "@breadcrumb/core-db";
import {
  computeContinuity,
  computeDailyActivity,
  computeLayerTrendSeries,
  computeWordSettledSeries,
  type DailyActivityCell,
  type LayerTrendPoint,
  TREND_WINDOW_DAYS,
  type TrendPoint,
} from "@breadcrumb/plugin-feedback";
import { getRepos } from "./db";
import { buildProductiveUseTimesByNode } from "./productiveUseTimes";
import { nowIso } from "./time";

/** 365 days of heatmap history — the figure the spec's copy templates were tested against. */
const HEATMAP_DAYS = 365;

export interface FeedbackData {
  cells: DailyActivityCell[];
  continuity: { activeDays: number; longestRunDays: number; currentRunDays: number };
  trends: {
    layers: LayerTrendPoint[];
    wordsSettled: TrendPoint[];
  };
}

/** Fetches sightings, conversations, mastery claims and every installed diglot pack's word
 * states/guesses/events, then computes the heatmap and trend view models. */
export async function loadFeedbackData(): Promise<FeedbackData> {
  const repos = await getRepos();
  const now = nowIso();

  const [sightings, conversations, masteryClaims, packs] = await Promise.all([
    repos.nodeSightings.listAll(),
    repos.conversations.listRecentFirst(),
    repos.masteryClaims.listAll(),
    repos.diglot.listPacks(),
  ]);
  const statesByPack = await Promise.all(packs.map((pack) => repos.diglot.listStates(pack.id)));
  const guessesByPack = await Promise.all(packs.map((pack) => repos.diglot.listGuesses(pack.id)));
  const eventsByPack = await Promise.all(packs.map((pack) => repos.diglot.listAllEvents(pack.id)));
  const wordStates: DiglotWordStateRow[] = statesByPack.flat();
  const guesses = guessesByPack.flat();
  const wordEvents: DiglotWordEventRow[] = eventsByPack.flat();

  // Heatmap footprint: node encounters, word guesses, and one mark per conversation opened —
  // the closest zero-migration proxy for "a message happened that day" (no message.listAll).
  const cells = computeDailyActivity(
    [
      ...sightings.map((sighting) => sighting.created_at),
      ...guesses.map((guess) => guess.created_at),
      ...conversations.map((conversation) => conversation.created_at),
    ],
    { days: HEATMAP_DAYS, todayIso: now },
  );
  const continuity = computeContinuity(cells);

  const productiveUseTimesByNode = await buildProductiveUseTimesByNode(repos, sightings);
  const trendWindow = { days: TREND_WINDOW_DAYS, todayIso: now };
  const trends = {
    layers: computeLayerTrendSeries({
      sightings,
      claims: masteryClaims,
      productiveUseTimesByNode,
      ...trendWindow,
    }),
    wordsSettled: computeWordSettledSeries(wordEvents, wordStates, trendWindow),
  };

  return { cells, continuity, trends };
}
