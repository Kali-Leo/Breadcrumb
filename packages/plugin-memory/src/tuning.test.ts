/**
 * Purpose: sanity tests for the tuning index — every re-exported value actually matches its
 * owning package's own constant, and the two groups partition sensibly.
 */
import { HELPS_WEIGHT_SCORES } from "@breadcrumb/plugin-graph";
import {
  CONFIDENCE_LEVEL_SCORES,
  INTEREST_LEVEL_SCORES,
  K_PSEUDO,
} from "@breadcrumb/plugin-interest";
import {
  PROPAGATION_INHERIT_FACTOR,
  ROUTE_INTEREST_CHIP_THRESHOLD,
} from "@breadcrumb/plugin-planner";
import { describe, expect, it } from "vitest";
import { LIT_THRESHOLD } from "./mastery";
import { productParams, userModelParams } from "./tuning";

describe("tuning", () => {
  it("productParams re-exports the exact values their owning packages define", () => {
    expect(productParams.litThreshold).toBe(LIT_THRESHOLD);
    expect(productParams.interestShrinkagePseudoCount).toBe(K_PSEUDO);
    expect(productParams.helpsWeightScores).toEqual(HELPS_WEIGHT_SCORES);
    expect(productParams.interestLevelScores).toEqual(INTEREST_LEVEL_SCORES);
    expect(productParams.confidenceLevelScores).toEqual(CONFIDENCE_LEVEL_SCORES);
    expect(productParams.propagationInheritFactor).toBe(PROPAGATION_INHERIT_FACTOR);
    expect(productParams.routeInterestChipThreshold).toBe(ROUTE_INTEREST_CHIP_THRESHOLD);
  });

  it("userModelParams carries the forgetting/interest half-lives as plain numbers", () => {
    expect(typeof userModelParams.claimHalfLifeDays).toBe("number");
    expect(typeof userModelParams.interestShortHalfLifeDays).toBe("number");
    expect(typeof userModelParams.interestLongHalfLifeDays).toBe("number");
    expect(typeof userModelParams.fsrsParametersNote).toBe("string");
  });
});
