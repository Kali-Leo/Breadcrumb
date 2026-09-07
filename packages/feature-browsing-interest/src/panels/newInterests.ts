/**
 * Purpose: the new-interests panel's data — topics whose recent share is both substantial and
 * well above where it has settled, each shown with the actual things that caused it. The
 * evidence matters more than the label: "you've started watching X" is only worth saying if the
 * reader can immediately see which three videos it means.
 *
 * Ported from Kali-Leo/feed-mode (`interest-model/daemon/app.py:399-421` — `new_interests`),
 * GPL-3.0, same copyright holder; modified 2026-09-07 (Python/SQL → a pure function over rows).
 *
 * The two guards are the whole design. Below fifty clicks in total the panel says nothing at
 * all: with two dozen opened videos a single click is a large share, and the panel would be
 * announcing coincidences as discoveries. And a topic must clear both an absolute floor and
 * twice its long-term share, so a topic that was always there does not get announced as new
 * merely because it ticked up.
 * Main exports: newInterests, MIN_ENGAGED_FOR_NEW_INTERESTS.
 */
import type { BrowsingEventRow } from "../events";
import type { ProfileDistributions } from "../profileShares";
import type { NewInterests } from "../schemas";
import { englishLeafName, TOPIC_LEAVES } from "../taxonomy";

/** Below this many clicks/watches, nothing is claimed. app.py:402-403. */
export const MIN_ENGAGED_FOR_NEW_INTERESTS = 50;
/** A topic must hold at least this share of recent behaviour. app.py:406. */
export const MIN_NEW_INTEREST_SHARE = 0.03;
/** …and at least this multiple of its long-term share (itself floored). app.py:406. */
export const NEW_INTEREST_RISE = 2;
const LONG_SHARE_FLOOR = 0.005;
/** How far back the illustrating items may come from. app.py:411. */
export const NEW_INTEREST_ITEM_DAYS = 14;
const MAX_ITEMS = 3;
const MAX_INTERESTS = 6;

const SECONDS_PER_DAY = 86400;
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

export interface NewInterestsInput {
  readonly distributions: ProfileDistributions;
  /** Clicks and watches ever recorded — exposures excluded on purpose. */
  readonly engagedCount: number;
  /** Recent events; exposures and anything outside the item window are ignored here. */
  readonly rows: readonly BrowsingEventRow[];
  readonly now: number;
}

/** Newest three items for one topic, one per video — a click and a watch of the same video are
 * one thing that happened, not two. app.py:409-414. */
function itemsForTopic(
  rows: readonly BrowsingEventRow[],
  topic: number,
): NewInterests["interests"][number]["items"] {
  const newestByVideo = new Map<string, BrowsingEventRow>();
  for (const row of rows) {
    if (row.topic !== topic) continue;
    const key = row.vid === "" ? row.title : row.vid;
    const seen = newestByVideo.get(key);
    if (seen === undefined || row.ts > seen.ts) newestByVideo.set(key, row);
  }
  return [...newestByVideo.values()]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, MAX_ITEMS)
    .map((row) => ({ title: row.title, up: row.up, id: row.vid, site: row.site }));
}

export function newInterests(input: NewInterestsInput): NewInterests {
  if (input.engagedCount < MIN_ENGAGED_FOR_NEW_INTERESTS) return { interests: [] };
  const since = input.now - NEW_INTEREST_ITEM_DAYS * SECONDS_PER_DAY;
  const recent = input.rows.filter((row) => row.etype !== "expose" && row.ts >= since);
  const interests: NewInterests["interests"] = [];
  for (let topic = 0; topic < TOPIC_LEAVES.length; topic++) {
    const share = input.distributions.short[topic] ?? 0;
    const before = input.distributions.long[topic] ?? 0;
    if (share < MIN_NEW_INTEREST_SHARE) continue;
    if (share < NEW_INTEREST_RISE * Math.max(before, LONG_SHARE_FLOOR)) continue;
    const name = TOPIC_LEAVES[topic] ?? "";
    interests.push({
      topic: name,
      topic_en: englishLeafName(name),
      share: round3(share),
      before: round3(before),
      items: itemsForTopic(recent, topic),
    });
  }
  interests.sort((a, b) => b.share - a.share);
  return { interests: interests.slice(0, MAX_INTERESTS) };
}
