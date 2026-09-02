import { describe, expect, it, vi } from "vitest";
import { withRequestBudget } from "./requestBudget";

describe("withRequestBudget", () => {
  it("aborts the signal once the budget runs out", async () => {
    vi.useFakeTimers();
    const observed: { signal: AbortSignal | null } = { signal: null };
    const pending = withRequestBudget(50, (signal) => {
      observed.signal = signal;
      return new Promise<never>((_, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason));
      });
    });
    vi.advanceTimersByTime(60);
    await expect(pending).rejects.toBeInstanceOf(DOMException);
    expect(observed.signal?.aborted).toBe(true);
    vi.useRealTimers();
  });

  it("never aborts after the work has settled", async () => {
    vi.useFakeTimers();
    const result = await withRequestBudget(50, async (signal) => {
      expect(signal.aborted).toBe(false);
      return "done";
    });
    expect(result).toBe("done");
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
