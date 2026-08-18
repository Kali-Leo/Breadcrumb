/**
 * Purpose: the first-run panel's material is what the reader is asked to recognise themselves in,
 * and what the first searches go looking for — so every label has to be a real, distinct, plain
 * Chinese category name, and the flat list the rest of the app reads has to be exactly what the
 * panel shows.
 */
import { describe, expect, it } from "vitest";
import {
  nextStance,
  ONBOARDING_FIELD_GROUPS,
  ONBOARDING_FIELDS,
  type OnboardingStance,
  stanceLabel,
} from "./discoveryOnboarding";

describe("the fields offered on the first run", () => {
  it("offers a wide list, in a handful of groups", () => {
    expect(ONBOARDING_FIELDS.length).toBeGreaterThanOrEqual(30);
    expect(ONBOARDING_FIELD_GROUPS.length).toBeGreaterThanOrEqual(4);
    expect(ONBOARDING_FIELD_GROUPS.length).toBeLessThanOrEqual(6);
    for (const group of ONBOARDING_FIELD_GROUPS) {
      expect(group.name.trim()).not.toBe("");
      expect(group.fields.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("is the groups' fields, in the order the panel shows them", () => {
    expect(ONBOARDING_FIELDS).toEqual(ONBOARDING_FIELD_GROUPS.flatMap((group) => group.fields));
  });

  it("names every field once, and never with an empty label", () => {
    expect(new Set(ONBOARDING_FIELDS).size).toBe(ONBOARDING_FIELDS.length);
    for (const field of ONBOARDING_FIELDS) {
      expect(field.trim()).toBe(field);
      expect(field).not.toBe("");
    }
  });

  it("keeps every label short, plain Chinese — no letters, digits or punctuation", () => {
    for (const field of [...ONBOARDING_FIELDS, ...ONBOARDING_FIELD_GROUPS.map((g) => g.name)]) {
      expect(field).toMatch(/^[一-龥]{2,6}$/u);
    }
  });
});

describe("the three positions", () => {
  it("cycles 一般 → 想看 → 不想看 and back", () => {
    expect(nextStance("neutral")).toBe("want");
    expect(nextStance("want")).toBe("avoid");
    expect(nextStance("avoid")).toBe("neutral");
  });

  it("has a word for each one, so a chip can wear its own position", () => {
    const labels: Record<OnboardingStance, string> = {
      neutral: "一般",
      want: "想看",
      avoid: "不想看",
    };
    for (const [stance, label] of Object.entries(labels)) {
      expect(stanceLabel(stance as OnboardingStance)).toBe(label);
    }
  });
});
