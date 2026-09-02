/**
 * Purpose: the diglot weave's once-a-day housekeeping — the local-day-rollover wiring, the
 * silent density adjustment that reads the last week of word events, and the recount of how
 * many new words today has already introduced. Split out of stores/diglotStore.ts purely to
 * keep that file under the file-size ceiling; it reaches back into the store the same way
 * the store's own out-of-line helpers do.
 * Main exports: wireDailyWordCounterTrigger, adjustDensityForYesterday,
 * recomputeNewWordsIntroducedToday.
 */
import { nextDensity } from "@breadcrumb/feature-diglot-weave";
import { useDiglotStore } from "../../stores/diglotStore";
import { getRepos } from "../platform/db";
import { nowIso, onLocalDayChange } from "../platform/time";

/** How much history the density loop looks at — a week smooths over one heavy evening. */
const DENSITY_WINDOW_DAYS = 7;

/** Guards the daily new-word counter's day-change wiring against double registration
 * (StrictMode double-invokes loadFromDatabase via App.tsx's effect). */
let dailyWordCounterTriggerWired = false;

export function wireDailyWordCounterTrigger(): void {
  if (dailyWordCounterTriggerWired) return;
  dailyWordCounterTriggerWired = true;
  onLocalDayChange(() => {
    void recomputeNewWordsIntroducedToday();
    void adjustDensityForYesterday();
  });
}

/**
 * One day's density adjustment (spec 033 + audit 2026-08-28 语言织入 #10): how often the
 * learner opened a woven word's meaning over the last week decides whether tomorrow's replies
 * carry a few more of them or a few less. Silent — density has never been on screen, and this
 * does not put it there.
 */
export async function adjustDensityForYesterday(): Promise<void> {
  const { settings } = useDiglotStore.getState();
  if (!settings.enabled) return;
  const repos = await getRepos();
  const since = new Date(Date.parse(nowIso()) - DENSITY_WINDOW_DAYS * 86_400_000).toISOString();
  const events = await repos.diglot.listEventsSince(settings.pairId, since);
  const observation = { wovenWords: 0, lookups: 0 };
  for (const event of events) {
    // One "exposure" per woven word shown; hover and a guess opened are the learner asking
    // what it means. Audio is not a lookup — hearing a word is not failing to know it.
    if (event.kind === "exposure") observation.wovenWords += 1;
    if (event.kind === "hover" || event.kind === "guess_wrong" || event.kind === "guess_close") {
      observation.lookups += 1;
    }
  }
  const density = nextDensity(settings.density, observation);
  if (density !== settings.density) {
    await useDiglotStore.getState().saveSettings({ density });
  }
}

/** Recomputes today's introduced-word count from the DB — called on local-day rollover so
 * an app kept open across midnight starts a fresh budget instead of carrying yesterday's
 * count (and yesterday's exhausted budget) until restart. */
export async function recomputeNewWordsIntroducedToday(): Promise<void> {
  const { settings, loaded } = useDiglotStore.getState();
  if (!settings.enabled || loaded === null) return;
  const repos = await getRepos();
  const states = await repos.diglot.listStates(settings.pairId);
  const today = nowIso().slice(0, 10);
  useDiglotStore.setState({
    newWordsIntroducedToday: states.filter((s) => s.introduced_at.startsWith(today)).length,
  });
}
