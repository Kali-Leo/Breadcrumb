/**
 * Purpose: tests for the host-wide pacer that keeps arXiv's one-request-per-three-seconds rule —
 * that the first request leaves immediately, that a queue of requests leaves one gap apart even
 * when they are all started at once, that a request which took longer than the gap does not have
 * to wait again, and that one failure does not jam the queue behind it.
 */
import { describe, expect, it } from "vitest";
import { RequestPacer } from "./requestPacer";

function pacerWithFakeClock(minimumIntervalMilliseconds = 3_000) {
  let clock = 0;
  const sleeps: number[] = [];
  const pacer = new RequestPacer({
    minimumIntervalMilliseconds,
    now: () => clock,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      clock += milliseconds;
    },
  });
  return { pacer, sleeps, advance: (milliseconds: number) => (clock += milliseconds) };
}

describe("RequestPacer", () => {
  it("lets the first request go without waiting", async () => {
    const { pacer, sleeps } = pacerWithFakeClock();
    await pacer.run(async () => "first");
    expect(sleeps).toEqual([]);
  });

  it("spaces a burst of requests one interval apart", async () => {
    const { pacer, sleeps } = pacerWithFakeClock();
    const order: string[] = [];
    await Promise.all(
      ["a", "b", "c"].map((name) =>
        pacer.run(async () => {
          order.push(name);
          return name;
        }),
      ),
    );
    expect(order).toEqual(["a", "b", "c"]);
    expect(sleeps).toEqual([3_000, 3_000]);
  });

  it("does not wait when the previous request already took longer than the interval", async () => {
    const { pacer, sleeps, advance } = pacerWithFakeClock();
    await pacer.run(async () => advance(5_000));
    await pacer.run(async () => "second");
    expect(sleeps).toEqual([]);
  });

  it("keeps letting requests through after one of them throws", async () => {
    const { pacer } = pacerWithFakeClock();
    await expect(
      pacer.run(async () => {
        throw new Error("network down");
      }),
    ).rejects.toThrow("network down");
    await expect(pacer.run(async () => "still working")).resolves.toBe("still working");
  });
});
