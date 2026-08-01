/**
 * Purpose: unit tests for the async concurrency pool — bounded parallelism, result ordering,
 * and the "stop launching new work" veto.
 */
import { describe, expect, it } from "vitest";
import { runPool } from "./pool";

function deferred<Value>(): { promise: Promise<Value>; resolve: (value: Value) => void } {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("runPool", () => {
  it("preserves result order regardless of completion order", async () => {
    const delays = [30, 10, 20];
    const results = await runPool(delays, 3, async (delayMs, index) => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return index;
    });
    expect(results).toEqual([0, 1, 2]);
  });

  it("never runs more than `concurrency` workers at once", async () => {
    let active = 0;
    let maxActive = 0;
    const items = Array.from({ length: 8 }, (_, i) => i);
    await runPool(items, 3, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
    });
    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it("stops launching new items once shouldStopLaunching returns true, without cancelling in-flight ones", async () => {
    const started: number[] = [];
    const gate = deferred<void>();
    let stop = false;

    const items = [0, 1, 2, 3];
    const runPromise = runPool(
      items,
      1,
      async (item) => {
        started.push(item);
        if (item === 0) {
          stop = true; // flip the veto right after the first item starts
          await gate.promise;
        }
        return item;
      },
      () => stop,
    );

    // Let the first worker start and set `stop`, then release it.
    await new Promise((resolve) => setTimeout(resolve, 10));
    gate.resolve();
    const results = await runPromise;

    expect(started).toEqual([0]);
    expect(results).toEqual([0, null, null, null]);
  });

  it("handles an empty item list without hanging", async () => {
    const results = await runPool([], 4, async () => "unused");
    expect(results).toEqual([]);
  });
});
