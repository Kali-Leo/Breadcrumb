/**
 * Purpose: unit tests for onLocalDayChange — the local-day rollover watcher behind the
 * daily gates (companion helpers, diglot word budget) staying correct across midnight
 * instead of only re-checking once per process. Stubs `window` (this project has no jsdom
 * dependency) and drives the 60s poll with fake timers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onLocalDayChange } from "./time";

let addEventListenerSpy: ReturnType<typeof vi.fn>;
let removeEventListenerSpy: ReturnType<typeof vi.fn>;
let focusHandlers: Array<() => void>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-15T10:00:00"));
  focusHandlers = [];
  addEventListenerSpy = vi.fn((event: string, handler: () => void) => {
    if (event === "focus") focusHandlers.push(handler);
  });
  removeEventListenerSpy = vi.fn();
  vi.stubGlobal("window", {
    addEventListener: addEventListenerSpy,
    removeEventListener: removeEventListenerSpy,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("onLocalDayChange", () => {
  it("does not fire while polling within the same local day", () => {
    const callback = vi.fn();
    onLocalDayChange(callback);
    vi.advanceTimersByTime(60_000);
    vi.advanceTimersByTime(60_000);
    expect(callback).not.toHaveBeenCalled();
  });

  it("fires on the next 60s poll once local midnight has passed", () => {
    const callback = vi.fn();
    onLocalDayChange(callback);
    vi.setSystemTime(new Date("2026-08-16T00:00:30"));
    vi.advanceTimersByTime(60_000);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("does not fire twice for the same day change on the following poll", () => {
    const callback = vi.fn();
    onLocalDayChange(callback);
    vi.setSystemTime(new Date("2026-08-16T00:00:30"));
    vi.advanceTimersByTime(60_000);
    vi.advanceTimersByTime(60_000);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("registers a window focus listener that fires immediately when the day already changed", () => {
    const callback = vi.fn();
    onLocalDayChange(callback);
    expect(addEventListenerSpy).toHaveBeenCalledWith("focus", expect.any(Function));
    vi.setSystemTime(new Date("2026-08-16T09:00:00"));
    for (const handler of focusHandlers) handler();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("a focus check on the same day is a no-op", () => {
    const callback = vi.fn();
    onLocalDayChange(callback);
    for (const handler of focusHandlers) handler();
    expect(callback).not.toHaveBeenCalled();
  });

  it("unsubscribe stops both the interval poll and the focus listener", () => {
    const callback = vi.fn();
    const unsubscribe = onLocalDayChange(callback);
    unsubscribe();
    expect(removeEventListenerSpy).toHaveBeenCalledWith("focus", expect.any(Function));
    vi.setSystemTime(new Date("2026-08-16T00:00:30"));
    vi.advanceTimersByTime(120_000);
    expect(callback).not.toHaveBeenCalled();
  });
});
