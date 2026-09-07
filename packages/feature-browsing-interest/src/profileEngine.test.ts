import { describe, expect, it } from "vitest";
import {
  applyEvent,
  createProfileState,
  DAEMON_CLOCK,
  decayProfile,
  eventWeight,
  ingestEvent,
  LITE_CLOCK,
  LONG_HALF_LIFE_SECONDS,
  SHORT_HALF_LIFE_SECONDS,
} from "./profileEngine";
import { profileDistributions } from "./profileShares";

const DAY = 86400;
/** A distribution that puts everything on topic 0, so a single number carries the whole test. */
const onlyFirst = (): number[] => {
  const probabilities = new Array<number>(48).fill(0);
  probabilities[0] = 1;
  return probabilities;
};

describe("eventWeight", () => {
  it("weighs an exposure once and a click five times", () => {
    expect(eventWeight("expose", 0)).toBe(1);
    expect(eventWeight("click", 0)).toBe(5);
  });

  it("gives a zero-dwell watch the bare click weight", () => {
    expect(eventWeight("watch", 0)).toBe(5);
  });

  it("caps a watch at fifteen however long the dwell", () => {
    expect(eventWeight("watch", 600)).toBe(15);
    expect(eventWeight("watch", 86400)).toBe(15);
    expect(eventWeight("watch", Number.MAX_SAFE_INTEGER)).toBe(15);
  });

  it("treats a negative or non-finite dwell as no dwell rather than as credit", () => {
    // Unclamped this is 5 + (-60) = -55, i.e. one bad event erasing real history.
    expect(eventWeight("watch", -3600)).toBe(5);
    expect(eventWeight("watch", Number.NaN)).toBe(5);
    expect(eventWeight("watch", Number.POSITIVE_INFINITY)).toBe(5);
  });
});

describe("decayProfile", () => {
  it("halves the short vector after exactly one short half-life", () => {
    const state = createProfileState();
    state.short[0] = 8;
    state.long[0] = 8;
    state.expose[0] = 8;
    state.ts = 0;
    decayProfile(state, SHORT_HALF_LIFE_SECONDS, DAEMON_CLOCK);
    expect(state.short[0]).toBe(4);
    expect(state.long[0]).toBe(8 * 0.5 ** (SHORT_HALF_LIFE_SECONDS / LONG_HALF_LIFE_SECONDS));
    // expose decays on the long clock, so it tracks long and not short.
    expect(state.expose[0]).toBe(state.long[0]);
  });

  it("does nothing before the first event, and only records the clock", () => {
    const state = createProfileState();
    decayProfile(state, 1000, DAEMON_CLOCK);
    expect(state.ts).toBe(1000);
    expect(state.short[0]).toBe(0);
  });

  it("ignores a clock that runs backwards instead of inflating the profile", () => {
    const state = createProfileState();
    state.short[0] = 8;
    state.ts = 10 * DAY;
    decayProfile(state, 5 * DAY, DAEMON_CLOCK);
    expect(state.short[0]).toBe(8);
    expect(state.ts).toBe(10 * DAY);
  });

  it("under the reference's policy lets the clock be dragged backwards", () => {
    const state = createProfileState();
    state.short[0] = 8;
    state.ts = 10 * DAY;
    decayProfile(state, 5 * DAY, LITE_CLOCK);
    expect(state.ts).toBe(5 * DAY);
  });

  it("a clock jumped a year forward flattens the profile — the reason for the daemon policy", () => {
    const state = createProfileState();
    state.short[0] = 1000;
    state.ts = 0;
    decayProfile(state, 365 * DAY, DAEMON_CLOCK);
    expect(state.short[0]).toBeLessThan(1e-12);
  });
});

describe("ingestEvent", () => {
  it("feeds an exposure to expose only, and a click to short and long only", () => {
    const state = createProfileState();
    ingestEvent(state, onlyFirst(), { type: "expose", ts: 0 }, 0);
    expect(state.expose[0]).toBe(1);
    expect(state.short[0]).toBe(0);
    ingestEvent(state, onlyFirst(), { type: "click", ts: 0 }, 0);
    expect(state.short[0]).toBe(5);
    expect(state.long[0]).toBe(5);
    expect(state.expose[0]).toBe(1);
    expect(state.n).toBe(2);
  });

  it("discounts a late-arriving event by its real age", () => {
    const late = createProfileState();
    ingestEvent(late, onlyFirst(), { type: "click", ts: 0 }, SHORT_HALF_LIFE_SECONDS);
    expect(late.short[0]).toBe(2.5);
    expect(late.long[0]).toBe(5 * 0.5 ** (SHORT_HALF_LIFE_SECONDS / LONG_HALF_LIFE_SECONDS));
  });

  it("credits a late event at full weight under the reference's policy", () => {
    const state = createProfileState();
    ingestEvent(state, onlyFirst(), { type: "click", ts: 0 }, SHORT_HALF_LIFE_SECONDS, LITE_CLOCK);
    expect(state.short[0]).toBe(5);
  });

  it("takes a missing timestamp as now", () => {
    const state = createProfileState();
    ingestEvent(state, onlyFirst(), { type: "click" }, 1234);
    expect(state.ts).toBe(1234);
    expect(state.short[0]).toBe(5);
  });
});

describe("short and long on sparse data", () => {
  it("moves short far more than long after one burst, which is what makes a rise detectable", () => {
    const state = createProfileState();
    const probabilities = new Array<number>(48).fill(0);
    probabilities[0] = 1;
    const older = new Array<number>(48).fill(0);
    older[1] = 1;
    // A settled history on topic 1, then a recent burst on topic 0.
    const now = 200 * DAY;
    for (let day = 90; day > 30; day--)
      ingestEvent(state, older, { type: "click" }, now - day * DAY);
    for (let i = 0; i < 5; i++) ingestEvent(state, probabilities, { type: "click" }, now);
    const distributions = profileDistributions(state);
    expect(distributions.short[0] ?? 0).toBeGreaterThan(distributions.long[0] ?? 0);
    expect(distributions.long[1] ?? 0).toBeGreaterThan(distributions.short[1] ?? 0);
  });

  it("leaves a never-touched profile as all zeros rather than as NaNs", () => {
    const distributions = profileDistributions(createProfileState());
    expect(distributions.short.every((share) => share === 0)).toBe(true);
    expect(distributions.long).toHaveLength(48);
  });
});

describe("applyEvent", () => {
  it("is exactly additive: two half-weight deposits equal one full one", () => {
    const once = createProfileState();
    applyEvent(once, onlyFirst(), "click", 4, 0, DAEMON_CLOCK.halfLives);
    const twice = createProfileState();
    applyEvent(twice, onlyFirst(), "click", 2, 0, DAEMON_CLOCK.halfLives);
    applyEvent(twice, onlyFirst(), "click", 2, 0, DAEMON_CLOCK.halfLives);
    expect(twice.short[0]).toBe(once.short[0]);
  });
});
