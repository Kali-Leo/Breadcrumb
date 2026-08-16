/**
 * Purpose: the "settled" word count read as a history instead of a snapshot (spec 035 T6) —
 * replays each woven word's signal events through the exact production FSRS mapping to find
 * when its stability crossed the settle bar, rather than approximating it.
 * Main exports: computeWordSettledSeries.
 */
import type { DiglotEventKind, DiglotWordEventRow, DiglotWordStateRow } from "@breadcrumb/core-db";
import { newWordCard, ratingForSignal, reviewCard } from "@breadcrumb/plugin-diglot-weave";
import { WORD_SETTLED_STABILITY_DAYS } from "./settled";
import { dateKeyRange, localDayEndIso } from "./trendDays";
import type { TrendPoint } from "./trends";

/** One word's rated-review checkpoints, replayed through the exact production
 * signal→rating mapping (`ratingForSignal`) and FSRS update (`reviewCard`) — the same logic
 * trainingLog.ts uses to rebuild review sequences, so this is a faithful history, not an
 * approximation. Each checkpoint is the card's stability right after a rated event. */
function replayStabilityCheckpoints(
  eventsAsc: readonly DiglotWordEventRow[],
  introducedAtIso: string,
): { ms: number; stability: number }[] {
  let card = newWordCard(new Date(introducedAtIso));
  const priorKinds: DiglotEventKind[] = [];
  let reps = 0;
  const checkpoints: { ms: number; stability: number }[] = [];
  for (const event of eventsAsc) {
    const rating = ratingForSignal(event.kind, priorKinds, event.latency_ms ?? undefined, reps);
    priorKinds.unshift(event.kind);
    if (priorKinds.length > 8) priorKinds.pop();
    if (rating === null) continue;
    card = reviewCard(event.pair, card, new Date(event.created_at), rating);
    checkpoints.push({ ms: Date.parse(event.created_at), stability: card.stability });
    reps += 1;
  }
  return checkpoints;
}

/** Count of woven words whose replayed FSRS stability has reached `WORD_SETTLED_STABILITY_DAYS`,
 * at each local day's end — the same bar settled.ts uses for "已长期掌握", read as a history
 * instead of a snapshot. Words absent from `states` (no known introduction time) are skipped:
 * fabricating a start date would not be honest. Near-monotonic in practice (stability only
 * drops on a lapse), never enforced as strictly increasing. */
export function computeWordSettledSeries(
  events: readonly DiglotWordEventRow[],
  states: readonly DiglotWordStateRow[],
  options: { days: number; todayIso: string },
): TrendPoint[] {
  const dateKeys = dateKeyRange(options.days, options.todayIso);
  const dayEndMsList = dateKeys.map((dateKey) => Date.parse(localDayEndIso(dateKey)));

  const introducedAtByLemma = new Map(states.map((state) => [state.lemma, state.introduced_at]));
  // Keyed by lemma, carrying its introduction instant alongside its events so the replay
  // loop below never needs a second (fallible) map lookup.
  const wordEventsByLemma = new Map<
    string,
    { introducedAt: string; events: DiglotWordEventRow[] }
  >();
  for (const event of events) {
    const introducedAt = introducedAtByLemma.get(event.lemma);
    if (introducedAt === undefined) continue;
    const existing = wordEventsByLemma.get(event.lemma);
    if (existing === undefined) {
      wordEventsByLemma.set(event.lemma, { introducedAt, events: [event] });
    } else {
      existing.events.push(event);
    }
  }

  const settledCounts = new Array<number>(dateKeys.length).fill(0);
  for (const { introducedAt, events: lemmaEvents } of wordEventsByLemma.values()) {
    const eventsAsc = [...lemmaEvents].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const checkpoints = replayStabilityCheckpoints(eventsAsc, introducedAt);

    let checkpointIndex = -1;
    for (let dayIndex = 0; dayIndex < dayEndMsList.length; dayIndex += 1) {
      const dayEndMs = dayEndMsList[dayIndex];
      if (dayEndMs === undefined) continue;
      let nextCheckpoint = checkpoints[checkpointIndex + 1];
      while (nextCheckpoint !== undefined && nextCheckpoint.ms <= dayEndMs) {
        checkpointIndex += 1;
        nextCheckpoint = checkpoints[checkpointIndex + 1];
      }
      const checkpoint = checkpoints[checkpointIndex];
      if (checkpoint === undefined) continue;
      if (checkpoint.stability >= WORD_SETTLED_STABILITY_DAYS) {
        settledCounts[dayIndex] = (settledCounts[dayIndex] ?? 0) + 1;
      }
    }
  }

  return dateKeys.map((date, index) => ({ date, value: settledCounts[index] ?? 0 }));
}
