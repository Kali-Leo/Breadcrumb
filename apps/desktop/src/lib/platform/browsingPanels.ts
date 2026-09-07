/**
 * Purpose: everything the discovery page renders, computed from this app's own database. One
 * read of the events table feeds all four panels and the profile, because they are four views
 * of the same rows and reading them four times would only invite the four to disagree.
 *
 * This is what replaced asking a separate program over a loopback port. The shapes are
 * unchanged — the panels were written against them and never needed to know.
 * Main exports: readDiscoveryData, DiscoveryData, WORD_CLOUD_WINDOWS.
 */
import {
  type BrowsingEventRow,
  type BrowsingProfile,
  buildBrowsingProfile,
  createProfileState,
  DAEMON_CLOCK,
  decayProfile,
  type EmotionCategory,
  type EmotionSeries,
  emotionSeries,
  type NewInterests,
  newInterests,
  type ProContent,
  proContentPanel,
  profileDistributions,
  type WordCloud,
  wordCloudWords,
} from "@breadcrumb/feature-browsing-interest";
import { getRepos } from "./db";

const SECONDS_PER_DAY = 86400;
/** The emotion curves and the learning-content list both cover a quarter. */
export const EMOTION_DAYS = 90;
export const PRO_CONTENT_DAYS = 90;
/** Word-cloud windows the page offers; the widest one sets how far back a read has to go. */
export const WORD_CLOUD_WINDOWS = [7, 30, 90, 365] as const;
/** How many clicks and watches the learning-content and driver lists may look through. */
const ENGAGED_ROW_LIMIT = 2000;

export interface DiscoveryData {
  readonly profile: BrowsingProfile;
  readonly emotion: EmotionSeries;
  readonly wordCloud: WordCloud;
  readonly newInterests: NewInterests;
  readonly proContent: ProContent;
  /** Total events on record. Zero is the page's "nothing has been collected yet" state, and
   * it is a fact rather than a failure. */
  readonly eventCount: number;
}

export interface DiscoveryQuery {
  readonly emotionCategory: EmotionCategory;
  readonly wordCloudDays: number;
  /** Seconds since the epoch. Injected so a test can pin the windows. */
  readonly now: number;
}

/**
 * Which classifier is behind what is on screen, as a single word for the profile's own field.
 * Taken from the rows rather than from a build constant: the background upgrade pass rewrites
 * rows over time, so the honest answer is whatever most of the recent evidence actually says.
 */
function classifierOf(rows: readonly BrowsingEventRow[]): string {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.classifier, (counts.get(row.classifier) ?? 0) + 1);
  let best = "";
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

/** Every panel on the discovery page, from one read. */
export async function readDiscoveryData(query: DiscoveryQuery): Promise<DiscoveryData> {
  const repos = await getRepos();
  const store = repos.browsingEvents;
  const widestWindow = Math.max(...WORD_CLOUD_WINDOWS, EMOTION_DAYS, PRO_CONTENT_DAYS);
  const [counts, rows, engagedRows, saved] = await Promise.all([
    store.counts(),
    store.listSince(query.now - widestWindow * SECONDS_PER_DAY),
    store.listEngagedSince(query.now - PRO_CONTENT_DAYS * SECONDS_PER_DAY, ENGAGED_ROW_LIMIT),
    store.loadProfile(),
  ]);
  const state = saved ?? createProfileState();
  // The snapshot was last decayed when the last event arrived, which may have been weeks ago.
  // Ageing it to now before reading shares is what stops the page showing a fortnight-old
  // "recently" as though it were today.
  decayProfile(state, query.now, DAEMON_CLOCK);
  return {
    eventCount: counts.events,
    profile: buildBrowsingProfile({
      state,
      eventCount: counts.events,
      engagedCount: counts.engaged,
      engagedRows,
      classifier: classifierOf(rows),
      emotionOn: rows.some((row) => row.emo !== null),
    }),
    emotion: emotionSeries(rows, {
      days: EMOTION_DAYS,
      category: query.emotionCategory,
      now: query.now,
    }),
    wordCloud: wordCloudWords(rows, {
      days: query.wordCloudDays,
      source: "engage",
      now: query.now,
    }),
    newInterests: newInterests({
      distributions: profileDistributions(state),
      engagedCount: counts.engaged,
      rows,
      now: query.now,
    }),
    proContent: proContentPanel(engagedRows, { days: PRO_CONTENT_DAYS, now: query.now }),
  };
}

/** The learning-content list on its own, for the planner's browsing-affinity bridge — it needs
 * the same aggregation the panel shows and nothing else on the page. */
export async function readProContent(now: number): Promise<ProContent> {
  const repos = await getRepos();
  const rows = await repos.browsingEvents.listEngagedSince(
    now - PRO_CONTENT_DAYS * SECONDS_PER_DAY,
    ENGAGED_ROW_LIMIT,
  );
  return proContentPanel(rows, { days: PRO_CONTENT_DAYS, now });
}
