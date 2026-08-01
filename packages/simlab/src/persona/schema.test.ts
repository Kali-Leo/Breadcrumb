/**
 * Purpose: validates every seed persona against personaSchema, and checks the schema rejects
 * out-of-range behavior axis values.
 */
import { describe, expect, it } from "vitest";
import { personaSchema } from "./schema";
import { SEED_PERSONAS } from "./seeds";

describe("personaSchema", () => {
  it("accepts every hand-written seed persona", () => {
    for (const persona of SEED_PERSONAS) {
      expect(() => personaSchema.parse(persona)).not.toThrow();
    }
  });

  it("requires at least one targetConcept (there must be something to recall)", () => {
    const invalid = {
      ...SEED_PERSONAS[0],
      knowledge: { ...SEED_PERSONAS[0]?.knowledge, targetConcepts: [] },
    };
    expect(() => personaSchema.parse(invalid)).toThrow();
  });

  it("rejects a behavior-axis value outside [0, 1]", () => {
    const invalid = {
      ...SEED_PERSONAS[0],
      behavior: { ...SEED_PERSONAS[0]?.behavior, typoRate: 1.5 },
    };
    expect(() => personaSchema.parse(invalid)).toThrow();
  });
});

describe("SEED_PERSONAS", () => {
  it("has at least 8 seed personas with unique ids", () => {
    expect(SEED_PERSONAS.length).toBeGreaterThanOrEqual(8);
    const ids = new Set(SEED_PERSONAS.map((persona) => persona.id));
    expect(ids.size).toBe(SEED_PERSONAS.length);
  });
});
