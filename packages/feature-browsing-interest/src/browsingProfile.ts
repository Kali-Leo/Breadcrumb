/**
 * Purpose: assemble the profile object the panels read, from the local accumulators instead of
 * a service response. The shape is unchanged on purpose — `browsingProfileSchema` was written
 * as the contract of the separate daemon, and keeping it means no panel notices that the daemon
 * is gone.
 *
 * Ported from Kali-Leo/feed-mode (`interest-model/daemon/app.py:458-478` — the `/profile`
 * response), GPL-3.0, same copyright holder; modified 2026-09-07 (Python → TypeScript; the HTTP
 * response became a value, and `version`/`update` — a self-update check against a GitHub
 * releases endpoint — are simply gone).
 * Main exports: buildBrowsingProfile, PROFILE_API_VERSION, DRIVER_TOPIC_COUNT.
 */
import type { InterestProfileState } from "./profileEngine";
import { exposureLift, profileDistributions, topDriverTopics } from "./profileShares";
import type { BrowsingProfile } from "./schemas";
import { englishLeafName, TOPIC_GROUPS, TOPIC_LEAVES } from "./taxonomy";

/** v2 is "per-video cumulative dwell in pro_content", which ./panels/proContentPanel does. */
export const PROFILE_API_VERSION = 2;
/** How many topics get illustrated with real titles. app.py:461. */
export const DRIVER_TOPIC_COUNT = 5;
/** Titles shown per driver topic. app.py:463. */
export const DRIVER_ITEM_COUNT = 3;

export interface BrowsingProfileInput {
  readonly state: InterestProfileState;
  /** Total events recorded, exposures included. */
  readonly eventCount: number;
  /** Clicks and watches only — the honest measure of evidence behind a share. */
  readonly engagedCount: number;
  /** Newest-first clicks and watches, used to illustrate the driver topics. */
  readonly engagedRows: ReadonlyArray<{ topic: number | null; title: string; up: string }>;
  /** Which classifier produced the topics behind this profile. */
  readonly classifier: string;
  /** Whether an emotion model was available, i.e. whether the emotion panel can say anything. */
  readonly emotionOn: boolean;
}

export function buildBrowsingProfile(input: BrowsingProfileInput): BrowsingProfile {
  const distributions = profileDistributions(input.state);
  const drivers: BrowsingProfile["drivers"] = {};
  for (const topic of topDriverTopics(distributions, DRIVER_TOPIC_COUNT)) {
    const items = input.engagedRows
      .filter((row) => row.topic === topic)
      .slice(0, DRIVER_ITEM_COUNT)
      .map((row) => ({ title: row.title, up: row.up }));
    const name = TOPIC_LEAVES[topic];
    if (items.length > 0 && name !== undefined) drivers[name] = items;
  }
  return {
    api_version: PROFILE_API_VERSION,
    topics: [...TOPIC_LEAVES],
    topics_en: TOPIC_LEAVES.map(englishLeafName),
    groups: Object.fromEntries(
      Object.entries(TOPIC_GROUPS).map(([group, leaves]) => [group, [...leaves]]),
    ),
    short: distributions.short,
    long: distributions.long,
    expose: distributions.expose,
    lift: exposureLift(distributions),
    prefs: { ...input.state.prefs },
    drivers,
    n_events: input.eventCount,
    n_engaged: input.engagedCount,
    classifier: input.classifier,
    emotion_on: input.emotionOn,
  };
}
