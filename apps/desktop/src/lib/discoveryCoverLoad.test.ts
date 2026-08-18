/**
 * Purpose: unit tests for a cover picture's deadline — a picture that arrives cancels it, an
 * error takes the fallback immediately, a load event over an empty picture counts as a failure,
 * and a host that answers nothing at all still hands the card its text-forward layout instead of
 * leaving a grey box on the grid forever.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COVER_LOAD_TIMEOUT_MILLISECONDS, watchCoverLoad } from "./discoveryCoverLoad";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("watchCoverLoad", () => {
  /**
   * FIXED (2026-08-17, spec 053 T10b). Several image hosts answer a direct request with a
   * connection they then leave open: the <img> fires neither `load` nor `error`, so the card's
   * "picture unavailable" path was never taken and a grey 16:9 block sat in the grid for the rest
   * of the session.
   */
  it("gives up on a picture that never answers", () => {
    const giveUp = vi.fn();
    const watch = watchCoverLoad(giveUp);
    watch.start();
    vi.advanceTimersByTime(COVER_LOAD_TIMEOUT_MILLISECONDS - 1);
    expect(giveUp).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(giveUp).toHaveBeenCalledTimes(1);
  });

  it("keeps a picture that arrives in time, and leaves no timer behind", () => {
    const giveUp = vi.fn();
    const watch = watchCoverLoad(giveUp);
    watch.start();
    watch.loaded(1200);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(COVER_LOAD_TIMEOUT_MILLISECONDS * 2);
    expect(giveUp).not.toHaveBeenCalled();
  });

  /** A 200 that carries a page rather than an image fires `load` all the same; the box would be
   * blank, which is the state the card already knows how to avoid. */
  it("treats a load that brought no picture as a picture that never came", () => {
    const giveUp = vi.fn();
    const watch = watchCoverLoad(giveUp);
    watch.start();
    watch.loaded(0);
    expect(giveUp).toHaveBeenCalledTimes(1);
  });

  it("takes the fallback the moment the picture errors", () => {
    const giveUp = vi.fn();
    const watch = watchCoverLoad(giveUp);
    watch.start();
    watch.failed();
    expect(giveUp).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    // A late error on a card that has already fallen back changes nothing.
    watch.failed();
    expect(giveUp).toHaveBeenCalledTimes(1);
  });

  /** The lazily loaded picture of a card ten screens down has not been requested yet: nothing is
   * late, so nothing may expire. The clock starts when the fetch does. */
  it("runs no clock at all until the picture is actually being fetched", () => {
    const giveUp = vi.fn();
    watchCoverLoad(giveUp);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(COVER_LOAD_TIMEOUT_MILLISECONDS * 3);
    expect(giveUp).not.toHaveBeenCalled();
  });

  it("decides nothing once the card is gone", () => {
    const giveUp = vi.fn();
    const watch = watchCoverLoad(giveUp);
    watch.start();
    watch.cancel();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(COVER_LOAD_TIMEOUT_MILLISECONDS * 2);
    watch.failed();
    expect(giveUp).not.toHaveBeenCalled();
  });

  it("counts one attempt once, however many times it is started", () => {
    const giveUp = vi.fn();
    const watch = watchCoverLoad(giveUp, 1000);
    watch.start();
    watch.start();
    vi.advanceTimersByTime(1000);
    expect(giveUp).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
