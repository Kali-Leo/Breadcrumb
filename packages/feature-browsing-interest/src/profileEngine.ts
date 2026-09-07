/**
 * Purpose: the two-timescale interest profile — three 48-dimensional accumulators (short,
 * long, expose) that decay exponentially and take a soft, whole-distribution deposit from every
 * browsing event. Short remembers roughly the last week, long roughly the last quarter, and
 * `expose` records what was merely *put in front of* the learner, so a later comparison can
 * separate "chose it" from "was fed it".
 *
 * Ported from Kali-Leo/feed-mode, GPL-3.0, same copyright holder; modified 2026-09-07
 * (JavaScript/Python → TypeScript; the two source implementations unified behind one clock
 * policy). Two implementations were merged here:
 * - `interest-model/lite/interest_lite.js:54-81` (`load`/`decay`/`ingest`) — the half-lives,
 *   the event weights, and the deposit rule;
 * - `interest-model/daemon/app.py:167,194-239` (`_decay`/`event_weight`/`_apply`/`update`) —
 *   the same arithmetic under a *server* clock, plus the late-event discount.
 *
 * The two differ in exactly one place, and it matters. `interest_lite.js:71` advances the decay
 * clock from the event's own timestamp; `app.py:194-203` advances it only from the local clock
 * and never lets it move backwards, and `app.py:208-215` discounts a late-arriving event by its
 * real age instead of crediting it at full weight. `DAEMON_CLOCK` is the default for that
 * reason — under `LITE_CLOCK` a client whose clock is a year fast flattens the whole profile in
 * one event, irreversibly. `LITE_CLOCK` exists so the parity test can reproduce the reference
 * implementation bit for bit.
 *
 * Units are the caller's: `now`, event timestamps and half-lives must share one unit. Seconds
 * everywhere in this app (the stored `ts` is seconds); `LITE_CLOCK` is in milliseconds because
 * the reference is.
 * Main exports: InterestProfileState, createProfileState, DAEMON_CLOCK, LITE_CLOCK,
 * eventWeight, decayProfile, applyEvent, ingestEvent.
 */
import { TOPIC_LEAVES } from "./taxonomy";

/** The event kinds the collectors emit. Nothing else is ever recorded. */
export type BrowsingEventType = "expose" | "click" | "watch";

export interface InterestProfileState {
  /** Recent behaviour, 7-day half-life. */
  short: number[];
  /** Settled behaviour, 90-day half-life. */
  long: number[];
  /** What the feed showed, 90-day half-life — the denominator of the exposure correction. */
  expose: number[];
  /** When the accumulators were last decayed to; null until the first event. */
  ts: number | null;
  /** Declared per-topic preferences, −2..+2, keyed by topic name. */
  prefs: Record<string, number>;
  /** Events accumulated, exposures included. */
  n: number;
}

export interface DecayHalfLives {
  readonly short: number;
  readonly long: number;
}

export interface ClockPolicy {
  readonly halfLives: DecayHalfLives;
  /** true: the clock never moves backwards (app.py:203). false: it follows whatever it is
   * given, including backwards (interest_lite.js:68). */
  readonly monotonic: boolean;
  /** true: an event that arrived late is discounted by its age before being deposited
   * (app.py:208-215). false: full weight regardless of age (interest_lite.js:75-78). */
  readonly discountLateEvents: boolean;
}

export const SHORT_HALF_LIFE_SECONDS = 7 * 86400;
export const LONG_HALF_LIFE_SECONDS = 90 * 86400;

/** The policy this app runs on: local clock, monotonic, late events discounted. Seconds. */
export const DAEMON_CLOCK: ClockPolicy = {
  halfLives: { short: SHORT_HALF_LIFE_SECONDS, long: LONG_HALF_LIFE_SECONDS },
  monotonic: true,
  discountLateEvents: true,
};

/** The reference implementation's policy, milliseconds. For parity testing only. */
export const LITE_CLOCK: ClockPolicy = {
  halfLives: { short: 7 * 86400e3, long: 90 * 86400e3 },
  monotonic: false,
  discountLateEvents: false,
};

export function createProfileState(): InterestProfileState {
  return {
    short: new Array<number>(TOPIC_LEAVES.length).fill(0),
    long: new Array<number>(TOPIC_LEAVES.length).fill(0),
    expose: new Array<number>(TOPIC_LEAVES.length).fill(0),
    ts: null,
    prefs: {},
    n: 0,
  };
}

/**
 * Weight of one event. An exposure counts once; a click five times; a watch five plus a minute
 * of dwell each, capped at ten — so the longest watch is worth fifteen exposures, and no single
 * session can dominate. (interest_lite.js:74, app.py:205-206.)
 */
export function eventWeight(type: BrowsingEventType, dwell: number): number {
  if (type === "expose") return 1;
  if (type === "click") return 5;
  // The floor is this port's addition. The reference multiplies straight through, so a
  // collector reporting a negative dwell (a clock that stepped back mid-watch) would SUBTRACT
  // the item's whole topic distribution from the profile. No valid input reaches it.
  const seconds = Number.isFinite(dwell) ? Math.max(0, dwell) : 0;
  return 5 + Math.min(seconds / 60, 10);
}

/** Decays all three accumulators forward to `now`, in place. */
export function decayProfile(state: InterestProfileState, now: number, policy: ClockPolicy): void {
  if (state.ts !== null) {
    const dt = Math.max(0, now - state.ts);
    const fastFactor = 0.5 ** (dt / policy.halfLives.short);
    const slowFactor = 0.5 ** (dt / policy.halfLives.long);
    for (let i = 0; i < state.short.length; i++) {
      state.short[i] = (state.short[i] ?? 0) * fastFactor;
      state.long[i] = (state.long[i] ?? 0) * slowFactor;
      state.expose[i] = (state.expose[i] ?? 0) * slowFactor;
    }
  }
  state.ts = policy.monotonic ? Math.max(state.ts ?? 0, now) : now;
}

/**
 * Deposits one event's whole topic distribution, pre-aged by `age`. An exposure feeds only
 * `expose`; a click or watch feeds `short` and `long` and never `expose` — that asymmetry is
 * the entire point of keeping three vectors.
 */
export function applyEvent(
  state: InterestProfileState,
  probabilities: readonly number[],
  type: BrowsingEventType,
  weight: number,
  age: number,
  halfLives: DecayHalfLives,
): void {
  const fastFactor = 0.5 ** (age / halfLives.short);
  const slowFactor = 0.5 ** (age / halfLives.long);
  for (let i = 0; i < state.short.length; i++) {
    const p = probabilities[i] ?? 0;
    if (type === "expose") state.expose[i] = (state.expose[i] ?? 0) + weight * p * slowFactor;
    else {
      state.short[i] = (state.short[i] ?? 0) + weight * p * fastFactor;
      state.long[i] = (state.long[i] ?? 0) + weight * p * slowFactor;
    }
  }
}

/** One event, start to finish: decay to `now`, then deposit it at its own age. */
export function ingestEvent(
  state: InterestProfileState,
  probabilities: readonly number[],
  event: { readonly type: BrowsingEventType; readonly dwell?: number; readonly ts?: number },
  now: number,
  policy: ClockPolicy = DAEMON_CLOCK,
): void {
  const eventTime = event.ts ?? now;
  decayProfile(state, policy.discountLateEvents ? now : eventTime, policy);
  const age = policy.discountLateEvents ? Math.max(0, now - eventTime) : 0;
  applyEvent(
    state,
    probabilities,
    event.type,
    eventWeight(event.type, event.dwell ?? 0),
    age,
    policy.halfLives,
  );
  state.n += 1;
}
