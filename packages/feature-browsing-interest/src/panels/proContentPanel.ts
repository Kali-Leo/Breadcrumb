/**
 * Purpose: the professional-content panel's data — the substantial things the learner opened,
 * split into what they finished and what they left unfinished. Unfinished is the useful half:
 * it is a reading list the learner already chose, sitting there half-read.
 *
 * Ported from Kali-Leo/feed-mode (`interest-model/daemon/app.py:349-397` — `pro_content`),
 * GPL-3.0, same copyright holder; modified 2026-09-07 (Python/SQL → a pure function over rows).
 *
 * Dwell accumulates per video and duration takes the maximum, because a collector settles a
 * segment every time the tab goes to the background: one video routinely arrives as several
 * watch events. Reading only the newest one records a video watched in three sittings as
 * unfinished, and a finished video reopened for twenty seconds as barely started.
 *
 * A video with no known duration and little dwell is listed nowhere rather than guessed at —
 * "watched 2 minutes of 0" is not a fact about anything.
 * Main exports: proContentPanel, PRO_FINISHED_FRACTION.
 */
import type { BrowsingEventRow } from "../events";
import type { ProContent, ProContentItem } from "../schemas";
import { groupOfTopic, PRO_TOPIC_INDICES, TOPIC_LEAVES } from "../taxonomy";

/** Watched at least this much of a known duration counts as finished. app.py:385. */
export const PRO_FINISHED_FRACTION = 0.8;
/** Below that, this much dwell still counts as started. app.py:387. */
export const PRO_STARTED_SECONDS = 30;
/** With no duration at all, this much dwell counts as finished. app.py:388. */
export const PRO_NO_DURATION_FINISHED_SECONDS = 600;
/** Cap per list, matching the reference. app.py:397. */
export const PRO_LIST_LIMIT = 100;

const SECONDS_PER_DAY = 86400;

export interface ProContentOptions {
  readonly days: number;
  readonly now: number;
}

interface Aggregate {
  item: ProContentItem;
  dwell: number;
  dur: number;
}

/**
 * `rows` should arrive newest first — the first row seen for a video supplies its title, author
 * and cover, and the output keeps that most-recent-first order.
 */
export function proContentPanel(
  rows: readonly BrowsingEventRow[],
  options: ProContentOptions,
): ProContent {
  const since = options.now - options.days * SECONDS_PER_DAY;
  const byVideo = new Map<string, Aggregate>();
  const order: string[] = [];
  for (const row of rows) {
    if (row.ts < since || row.etype === "expose") continue;
    if (row.topic === null || !PRO_TOPIC_INDICES.has(row.topic)) continue;
    const key = row.vid === "" ? row.title : row.vid;
    const seen = byVideo.get(key);
    if (seen === undefined) {
      byVideo.set(key, { item: itemFrom(row), dwell: row.dwell, dur: row.dur });
      order.push(key);
    } else {
      seen.dwell += row.dwell;
      seen.dur = Math.max(seen.dur, row.dur);
    }
  }
  const finished: ProContentItem[] = [];
  const unfinished: ProContentItem[] = [];
  for (const key of order) {
    const aggregate = byVideo.get(key);
    if (aggregate === undefined) continue;
    const item: ProContentItem = {
      ...aggregate.item,
      dwell: Math.round(aggregate.dwell),
      dur: Math.round(aggregate.dur),
    };
    if (aggregate.dur > 0) {
      if (aggregate.dwell / aggregate.dur >= PRO_FINISHED_FRACTION) finished.push(item);
      else if (aggregate.dwell >= PRO_STARTED_SECONDS) unfinished.push(item);
    } else if (aggregate.dwell >= PRO_NO_DURATION_FINISHED_SECONDS) finished.push(item);
  }
  return {
    days: options.days,
    finished: finished.slice(0, PRO_LIST_LIMIT),
    unfinished: unfinished.slice(0, PRO_LIST_LIMIT),
  };
}

function itemFrom(row: BrowsingEventRow): ProContentItem {
  const topic = row.topic === null ? "" : (TOPIC_LEAVES[row.topic] ?? "");
  return {
    ts: row.ts,
    id: row.vid,
    title: row.title,
    up: row.up,
    topic,
    group: row.topic === null ? "" : groupOfTopic(row.topic),
    pic: row.pic,
    dwell: row.dwell,
    dur: row.dur,
    site: row.site,
  };
}
