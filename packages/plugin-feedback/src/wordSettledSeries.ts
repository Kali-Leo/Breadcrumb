/**
 * Purpose: word trend histories replayed through the exact production FSRS mapping (spec
 * 035 T6) — the "settled" count plus the word memory/intuition layer estimates, mirroring
 * plugin-memory's concept layers over woven words instead of approximating them.
 * Main exports: WORD_SETTLED_STABILITY_DAYS, WordLayerTrendPoint, computeWordSettledSeries,
 * computeWordLayerTrendSeries.
 */
import type {
  DiglotEventKind,
  DiglotPairId,
  DiglotWordEventRow,
  DiglotWordStateRow,
} from "@breadcrumb/core-db";
import {
  newWordCard,
  ratingForSignal,
  retrievabilityOf,
  reviewCard,
} from "@breadcrumb/plugin-diglot-weave";
import type { Card } from "ts-fsrs";
import { dateKeyRange, localDayEndIso } from "./trendDays";
import type { TrendPoint } from "./trends";

/** Word settle bar (spec 035 #7): FSRS stability at/above 30 days — a month-plus forgetting
 * half-life. The anchor is the Anki community's "mature = interval >= 21 days" convention,
 * which this repo's own survey (docs/research/2026-08-13-折线指标-纵向学习度量调研.md) took as
 * the honest lower bound for "actually learned"; 30 days sits just past it.
 * (Lived in settled.ts until that module — the retired "已长期掌握" confirmation lists —
 * was deleted on 2026-09-01 with the rest of the concept-side review-invitation corpses.) */
export const WORD_SETTLED_STABILITY_DAYS = 30;

export interface WordLayerTrendPoint {
  /** Local calendar date, "YYYY-MM-DD". */
  date: string;
  /** Σ retrievability over replayed word cards — the estimated recallable word count. */
  memory: number;
  /** The long-stable (≥ settle bar), productively-used share of `memory` — the word
   * counterpart of plugin-memory's "intuition" layer. */
  intuition: number;
}

interface WordReplay {
  pair: DiglotPairId;
  /** The card's full state right after each rated event, ascending in time. */
  checkpoints: { ms: number; card: Card }[];
  /** Instants of "productive_use" events (the learner using the word in their own
   * message), ascending — the production footprint the intuition layer requires. */
  productiveUseMsAscending: number[];
}

/** One word's rated-review checkpoints, replayed through the exact production
 * signal→rating mapping (`ratingForSignal`) and FSRS update (`reviewCard`) — the same logic
 * trainingLog.ts uses to rebuild review sequences, so this is a faithful history, not an
 * approximation. */
function replayWord(eventsAsc: readonly DiglotWordEventRow[], introducedAtIso: string): WordReplay {
  let card = newWordCard(new Date(introducedAtIso));
  const priorKinds: DiglotEventKind[] = [];
  let reps = 0;
  const replay: WordReplay = {
    pair: eventsAsc[0]?.pair ?? "zh:en",
    checkpoints: [],
    productiveUseMsAscending: [],
  };
  for (const event of eventsAsc) {
    if (event.kind === "productive_use") {
      replay.productiveUseMsAscending.push(Date.parse(event.created_at));
    }
    const rating = ratingForSignal(event.kind, priorKinds, event.latency_ms ?? undefined, reps);
    priorKinds.unshift(event.kind);
    if (priorKinds.length > 8) priorKinds.pop();
    if (rating === null) continue;
    card = reviewCard(event.pair, card, new Date(event.created_at), rating);
    replay.checkpoints.push({ ms: Date.parse(event.created_at), card });
    reps += 1;
  }
  return replay;
}

/** Replays every word that has a known introduction time. Words absent from `states` are
 * skipped: fabricating a start date would not be honest. */
function replayAllWords(
  events: readonly DiglotWordEventRow[],
  states: readonly DiglotWordStateRow[],
): WordReplay[] {
  const introducedAtByLemma = new Map(states.map((state) => [state.lemma, state.introduced_at]));
  const eventsByLemma = new Map<string, { introducedAt: string; events: DiglotWordEventRow[] }>();
  for (const event of events) {
    const introducedAt = introducedAtByLemma.get(event.lemma);
    if (introducedAt === undefined) continue;
    const existing = eventsByLemma.get(event.lemma);
    if (existing === undefined) {
      eventsByLemma.set(event.lemma, { introducedAt, events: [event] });
    } else {
      existing.events.push(event);
    }
  }
  return [...eventsByLemma.values()].map(({ introducedAt, events: lemmaEvents }) => {
    const eventsAsc = [...lemmaEvents].sort((a, b) => a.created_at.localeCompare(b.created_at));
    return replayWord(eventsAsc, introducedAt);
  });
}

/** Walks one word's checkpoints across the day-end sample list (forward pointers, so the
 * whole series stays linear) and reports the card in force at each day's end. */
function forEachSampledDay(
  replay: WordReplay,
  dayEndMsList: readonly number[],
  visit: (dayIndex: number, dayEndMs: number, card: Card, hasProductiveUse: boolean) => void,
): void {
  let checkpointIndex = -1;
  let productiveIndex = -1;
  for (let dayIndex = 0; dayIndex < dayEndMsList.length; dayIndex += 1) {
    const dayEndMs = dayEndMsList[dayIndex];
    if (dayEndMs === undefined) continue;
    let nextCheckpoint = replay.checkpoints[checkpointIndex + 1];
    while (nextCheckpoint !== undefined && nextCheckpoint.ms <= dayEndMs) {
      checkpointIndex += 1;
      nextCheckpoint = replay.checkpoints[checkpointIndex + 1];
    }
    let nextProductiveMs = replay.productiveUseMsAscending[productiveIndex + 1];
    while (nextProductiveMs !== undefined && nextProductiveMs <= dayEndMs) {
      productiveIndex += 1;
      nextProductiveMs = replay.productiveUseMsAscending[productiveIndex + 1];
    }
    const checkpoint = replay.checkpoints[checkpointIndex];
    if (checkpoint === undefined) continue;
    visit(dayIndex, dayEndMs, checkpoint.card, productiveIndex >= 0);
  }
}

/** Count of woven words whose replayed FSRS stability has reached `WORD_SETTLED_STABILITY_DAYS`,
 * at each local day's end — the same bar settled.ts uses for "已长期掌握", read as a history
 * instead of a snapshot. Near-monotonic in practice (stability only drops on a lapse), never
 * enforced as strictly increasing. */
export function computeWordSettledSeries(
  events: readonly DiglotWordEventRow[],
  states: readonly DiglotWordStateRow[],
  options: { days: number; todayIso: string },
): TrendPoint[] {
  const dateKeys = dateKeyRange(options.days, options.todayIso);
  const dayEndMsList = dateKeys.map((dateKey) => Date.parse(localDayEndIso(dateKey)));
  const settledCounts = new Array<number>(dateKeys.length).fill(0);
  for (const replay of replayAllWords(events, states)) {
    forEachSampledDay(replay, dayEndMsList, (dayIndex, _dayEndMs, card) => {
      if (card.stability >= WORD_SETTLED_STABILITY_DAYS) {
        settledCounts[dayIndex] = (settledCounts[dayIndex] ?? 0) + 1;
      }
    });
  }
  return dateKeys.map((date, index) => ({ date, value: settledCounts[index] ?? 0 }));
}

/** Word counterpart of plugin-memory's computeKnowledgeLayerSeries, one point per local
 * day's end: memory = Σ retrievability over replayed cards (0 until a word's first rated
 * event — FSRS has no honest estimate before one); intuition = the same sum restricted to
 * words whose stability cleared the settle bar AND that have a recorded productive use.
 * There is deliberately no "understanding" layer here: words carry no explanation/claim
 * data, so none is drawn. Both values round to one decimal for display. */
export function computeWordLayerTrendSeries(
  events: readonly DiglotWordEventRow[],
  states: readonly DiglotWordStateRow[],
  options: { days: number; todayIso: string },
): WordLayerTrendPoint[] {
  const dateKeys = dateKeyRange(options.days, options.todayIso);
  const dayEndMsList = dateKeys.map((dateKey) => Date.parse(localDayEndIso(dateKey)));
  const memory = new Array<number>(dateKeys.length).fill(0);
  const intuition = new Array<number>(dateKeys.length).fill(0);
  for (const replay of replayAllWords(events, states)) {
    forEachSampledDay(replay, dayEndMsList, (dayIndex, dayEndMs, card, hasProductiveUse) => {
      const retrievability = retrievabilityOf(replay.pair, card, new Date(dayEndMs));
      memory[dayIndex] = (memory[dayIndex] ?? 0) + retrievability;
      if (card.stability >= WORD_SETTLED_STABILITY_DAYS && hasProductiveUse) {
        intuition[dayIndex] = (intuition[dayIndex] ?? 0) + retrievability;
      }
    });
  }
  return dateKeys.map((date, index) => ({
    date,
    memory: Math.round((memory[index] ?? 0) * 10) / 10,
    intuition: Math.round((intuition[index] ?? 0) * 10) / 10,
  }));
}
