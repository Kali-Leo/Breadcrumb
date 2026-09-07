/**
 * Purpose: the browsing event as it arrives from a collector and as it is stored. Events come
 * from outside the app (a user script the learner installed), so every field is parsed, never
 * asserted, and every string is length-capped before it can reach the database.
 *
 * Ported from Kali-Leo/feed-mode (`interest-model/daemon/app.py:171-181` for the row shape and
 * `app.py:217-239` for the normalisation), GPL-3.0, same copyright holder; modified 2026-09-07
 * (Python → TypeScript; the ad-hoc `str(...)[:n]` truncation replaced by explicit code-point
 * truncation, and the whole thing put behind Zod).
 *
 * The timestamp rule is the important one. A collector's clock is not trusted: a timestamp in
 * the future, or older than thirty days, is replaced by "now" (app.py:221-222). Everything
 * downstream — decay, day buckets, the recency windows — is driven by that number, so an
 * unchecked one is not a wrong row, it is a wrong profile.
 * Main exports: browsingEventSchema, BrowsingEvent, BrowsingEventRow, normalizeEvent,
 * classificationOf.
 */
import { z } from "zod";
import type { BrowsingEventType } from "./profileEngine";
import { EMOTION_VALENCES } from "./taxonomy";

/** How far back a collector's timestamp may reach before it stops being believable. */
export const MAX_EVENT_AGE_SECONDS = 30 * 86400;
/** How far into the future, to absorb ordinary clock skew rather than reject it. */
export const MAX_EVENT_SKEW_SECONDS = 60;

const TITLE_MAX = 120;
const AUTHOR_MAX = 40;
const VIDEO_ID_MAX = 30;
const PICTURE_MAX = 200;

/** Truncates by Unicode code point, so a cap can never split a character in half. */
function cap(value: string, limit: number): string {
  const points = Array.from(value);
  return points.length <= limit ? value : points.slice(0, limit).join("");
}

const text = z
  .unknown()
  .transform((value) => (typeof value === "string" ? value : ""))
  .catch("");
const finite = z
  .unknown()
  .transform((value) => {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  })
  .catch(0);

/** One event exactly as a collector sends it — field names are the wire contract. */
export const browsingEventSchema = z.object({
  type: z.enum(["expose", "click", "watch"]).catch("expose"),
  id: text,
  t: text,
  u: text,
  pic: text,
  site: text,
  dwell: finite,
  dur: finite,
  /** Seconds since the epoch, fractional. Absent — or unusable — means "now", which is why
   * this one stays `undefined` instead of collapsing to 0 like the other numbers: a 0 here
   * would be January 1970, and every window and decay downstream would believe it. */
  ts: z
    .unknown()
    .transform((value) => {
      const parsed = typeof value === "number" ? value : Number(value);
      return Number.isFinite(parsed) && value !== null && value !== "" ? parsed : undefined;
    })
    .catch(undefined),
});
export type BrowsingEvent = z.infer<typeof browsingEventSchema>;

/** A stored event: the wire fields, capped, plus what the classifier concluded about it. */
export interface BrowsingEventRow {
  readonly ts: number;
  readonly site: string;
  readonly vid: string;
  readonly title: string;
  readonly up: string;
  readonly etype: BrowsingEventType;
  readonly dwell: number;
  readonly dur: number;
  /** Top-1 topic index, or null when nothing classified it. */
  readonly topic: number | null;
  /** Top-1 emotion index, or null when no emotion model was available. */
  readonly emo: number | null;
  /** Probability-weighted valence, −2..+2, or null when no emotion model was available. */
  readonly valence: number | null;
  readonly pic: string;
  /** Which classifier produced `topic`/`emo` — so a later, better one can find its own rows. */
  readonly classifier: string;
}

/** The trusted-window rule: an implausible timestamp becomes `now` rather than being kept. */
export function trustedEventTime(rawTs: number | undefined, now: number): number {
  if (rawTs === undefined) return now;
  const tooOld = rawTs < now - MAX_EVENT_AGE_SECONDS;
  const tooNew = rawTs > now + MAX_EVENT_SKEW_SECONDS;
  return tooOld || tooNew ? now : rawTs;
}

export interface EventClassification {
  readonly topicProbabilities: readonly number[];
  readonly emotionProbabilities?: readonly number[] | undefined;
  readonly classifier: string;
}

/** Argmax, and the valence expectation over the whole emotion distribution (app.py:236-237). */
export function classificationOf(classification: EventClassification): {
  topic: number;
  emo: number | null;
  valence: number | null;
} {
  const emotions = classification.emotionProbabilities;
  if (emotions === undefined)
    return { topic: argmax(classification.topicProbabilities), emo: null, valence: null };
  let valence = 0;
  for (let i = 0; i < emotions.length; i++)
    valence += (emotions[i] ?? 0) * (EMOTION_VALENCES[i] ?? 0);
  return { topic: argmax(classification.topicProbabilities), emo: argmax(emotions), valence };
}

function argmax(vector: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < vector.length; i++) if ((vector[i] ?? 0) > (vector[best] ?? 0)) best = i;
  return best;
}

/** A parsed event plus its classification, ready to store. */
export function normalizeEvent(
  event: BrowsingEvent,
  classification: EventClassification,
  now: number,
): BrowsingEventRow {
  const { topic, emo, valence } = classificationOf(classification);
  return {
    ts: trustedEventTime(event.ts, now),
    site: event.site === "" ? "?" : cap(event.site, AUTHOR_MAX),
    vid: cap(event.id, VIDEO_ID_MAX),
    title: cap(event.t, TITLE_MAX),
    up: cap(event.u, AUTHOR_MAX),
    etype: event.type,
    dwell: event.dwell,
    dur: event.dur,
    topic,
    emo,
    valence,
    pic: cap(event.pic, PICTURE_MAX),
    classifier: classification.classifier,
  };
}
