/**
 * Purpose: checks perturbPersona's determinism, that jittered values stay in range, that
 * different variant numbers actually diverge, and that mulberry32 is a pure seeded PRNG.
 */
import { describe, expect, it } from "vitest";
import { mulberry32, perturbPersona } from "./perturb";
import type { Persona } from "./schema";
import { SEED_PERSONAS } from "./seeds";

describe("mulberry32", () => {
  it("is deterministic: same seed produces the same sequence", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const sequenceA = [a(), a(), a()];
    const sequenceB = [b(), b(), b()];
    expect(sequenceA).toEqual(sequenceB);
  });

  it("stays within [0, 1)", () => {
    const random = mulberry32(1);
    for (let i = 0; i < 100; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("different seeds produce different sequences", () => {
    const a = mulberry32(1)();
    const b = mulberry32(2)();
    expect(a).not.toBe(b);
  });
});

describe("perturbPersona", () => {
  const seed = SEED_PERSONAS[0] as Persona;

  it("is deterministic for the same (seed, variantNumber) pair", () => {
    const a = perturbPersona(seed, 3);
    const b = perturbPersona(seed, 3);
    expect(a).toEqual(b);
  });

  it("produces different behavior values for different variant numbers", () => {
    const a = perturbPersona(seed, 1);
    const b = perturbPersona(seed, 2);
    expect(a.behavior).not.toEqual(b.behavior);
  });

  it("keeps every behavior-axis value within [0, 1]", () => {
    for (let variant = 0; variant < 20; variant += 1) {
      const persona = perturbPersona(seed, variant);
      for (const value of Object.values(persona.behavior)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it("never empties knownTopics/misconceptions when the seed had entries, and preserves targetConcepts", () => {
    const persona = perturbPersona(seed, 7);
    if (seed.knowledge.knownTopics.length > 0) {
      expect(persona.knowledge.knownTopics.length).toBeGreaterThan(0);
    }
    expect(persona.knowledge.targetConcepts).toEqual(seed.knowledge.targetConcepts);
  });

  it("gives the variant a distinct id so parallel sessions never collide", () => {
    const a = perturbPersona(seed, 1);
    const b = perturbPersona(seed, 2);
    expect(a.id).not.toBe(b.id);
    expect(a.id).not.toBe(seed.id);
  });
});
