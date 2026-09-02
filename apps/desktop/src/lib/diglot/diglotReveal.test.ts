/**
 * Purpose: unit tests for the reveal-time refine timeout race — fast refine lands, slow
 * refine ships the base weave, and the pending timer is cleaned up on the fast path.
 */
import type { ReplacementPatch } from "@breadcrumb/feature-diglot-weave";
import { afterEach, describe, expect, it, vi } from "vitest";
import { refineWithHardTimeout } from "./diglotReveal";

function patch(replacement: string): ReplacementPatch {
  return { kind: "word", lemma: "书", original: "书", replacement, start: 0, end: 1 };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("refineWithHardTimeout", () => {
  it("returns the refined patches when refine beats the timeout", async () => {
    const refined = [patch("book")];
    const result = await refineWithHardTimeout(() => Promise.resolve(refined), [patch("base")], 50);
    expect(result).toBe(refined);
  });

  it("ships the base patches when refine exceeds the timeout", async () => {
    vi.useFakeTimers();
    const base = [patch("base")];
    const never = () => new Promise<ReplacementPatch[]>(() => undefined);
    const pending = refineWithHardTimeout(never, base, 2000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await pending).toBe(base);
  });

  it("does not leave the timeout pending after a fast refine", async () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    await refineWithHardTimeout(() => Promise.resolve([patch("book")]), [], 2000);
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
