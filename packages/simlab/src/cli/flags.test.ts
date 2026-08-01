/**
 * Purpose: unit tests for `sim run` flag parsing and its defaults.
 */
import { describe, expect, it } from "vitest";
import { parseRunFlags } from "./flags";

describe("parseRunFlags", () => {
  it("defaults to 2 journeys, 2 workers, 14 days, ¥5 budget", () => {
    expect(parseRunFlags([])).toEqual({ journeys: 2, workers: 2, days: 14, budgetCny: 5 });
  });

  it("overrides every flag when given", () => {
    expect(
      parseRunFlags(["--journeys", "5", "--workers", "3", "--days", "7", "--budgetCny", "10"]),
    ).toEqual({ journeys: 5, workers: 3, days: 7, budgetCny: 10 });
  });

  it("ignores unknown flags", () => {
    expect(parseRunFlags(["--unknown", "value", "--journeys", "1"]).journeys).toBe(1);
  });
});
