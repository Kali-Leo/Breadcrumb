/**
 * Purpose: unit test for the mastery tripwire self-check — both properties must hold on the
 * current feature-memory implementation.
 */
import { describe, expect, it } from "vitest";
import { checkMasteryTripwires } from "./masteryTripwire";

describe("checkMasteryTripwires", () => {
  it("confirms re-encounter raises retention and idle time decays it", () => {
    const result = checkMasteryTripwires();
    expect(result.detail).toEqual([]);
    expect(result.reencounterBoostValid).toBe(true);
    expect(result.idleDecayValid).toBe(true);
  });
});
