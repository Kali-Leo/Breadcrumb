/**
 * Purpose: the fog's display mapping. The memory model is not under test here — what is, is
 * that a place nobody has visited for a year actually looks foggy, which is what the old
 * linear mapping could not do (audit 2026-08-28, 记忆与遗忘 #4).
 */
import { describe, expect, it } from "vitest";
import { fadeOf } from "./fog";

describe("fadeOf", () => {
  it("draws nothing over a place just visited", () => {
    expect(fadeOf(1)).toBe(0);
    expect(fadeOf(0.98)).toBeLessThan(0.05);
  });

  it("reaches full fade at the retention a long-neglected place actually sits at", () => {
    // FSRS leaves a concept met a few times and abandoned for a year around 0.46.
    expect(fadeOf(0.46)).toBeGreaterThan(0.95);
    expect(fadeOf(0.2)).toBe(1);
    expect(fadeOf(0)).toBe(1);
  });

  it("still fades gradually in between, rather than snapping", () => {
    expect(fadeOf(0.9)).toBeGreaterThan(fadeOf(0.95));
    expect(fadeOf(0.7)).toBeGreaterThan(fadeOf(0.9));
    expect(fadeOf(0.7)).toBeLessThan(1);
  });
});
