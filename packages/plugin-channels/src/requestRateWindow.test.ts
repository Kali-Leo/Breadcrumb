/**
 * Purpose: tests for the shared per-service ceiling — that staying under the budget costs nothing
 * at all, that a caller over it is turned away rather than made to wait, and that the window rolls
 * forward with the clock. The "turned away, never delayed" part is the whole design: a sleeping
 * version of this added fifteen seconds to every restock with three podcast charts due, and stalls
 * outright when the caller's clock is a simulated one.
 */
import { describe, expect, it } from "vitest";
import { RequestRateWindow } from "./requestRateWindow";

function windowWithFakeClock(maximumRequests = 3, windowMilliseconds = 60_000) {
  let clock = 0;
  const rateWindow = new RequestRateWindow({
    maximumRequests,
    windowMilliseconds,
    now: () => clock,
  });
  return { rateWindow, advance: (milliseconds: number) => (clock += milliseconds) };
}

describe("RequestRateWindow", () => {
  it("lets everything through while the budget has room, however fast the calls come", () => {
    const { rateWindow } = windowWithFakeClock();
    expect([rateWindow.tryAcquire(), rateWindow.tryAcquire(), rateWindow.tryAcquire()]).toEqual([
      true,
      true,
      true,
    ]);
    expect(rateWindow.remaining()).toBe(0);
  });

  it("turns the caller away past the budget instead of making it wait", () => {
    const { rateWindow } = windowWithFakeClock(2);
    expect(rateWindow.tryAcquire()).toBe(true);
    expect(rateWindow.tryAcquire()).toBe(true);
    expect(rateWindow.tryAcquire()).toBe(false);
    // A refused claim spends nothing, so asking again the next instant is still a refusal and not
    // a slowly filling queue.
    expect(rateWindow.remaining()).toBe(0);
  });

  it("gives the room back as the window rolls past each request", () => {
    const { rateWindow, advance } = windowWithFakeClock(2);
    rateWindow.tryAcquire();
    advance(20_000);
    rateWindow.tryAcquire();
    expect(rateWindow.tryAcquire()).toBe(false);
    advance(40_001);
    // The first request is now over a minute old; the second is not.
    expect(rateWindow.remaining()).toBe(1);
    expect(rateWindow.tryAcquire()).toBe(true);
    expect(rateWindow.tryAcquire()).toBe(false);
  });

  it("holds no memory of a window that has entirely rolled past", () => {
    const { rateWindow, advance } = windowWithFakeClock(2);
    rateWindow.tryAcquire();
    rateWindow.tryAcquire();
    advance(60_001);
    expect(rateWindow.remaining()).toBe(2);
  });

  it("treats a budget of zero as one, rather than as a source that can never fetch", () => {
    const rateWindow = new RequestRateWindow({ maximumRequests: 0, windowMilliseconds: 1_000 });
    expect(rateWindow.tryAcquire()).toBe(true);
  });
});
