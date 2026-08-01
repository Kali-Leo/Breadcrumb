/**
 * Purpose: unit tests for persona selection across a run's journeys.
 */
import { describe, expect, it } from "vitest";
import { SEED_PERSONAS } from "../persona/seeds";
import { selectPersonas } from "./selectPersonas";

describe("selectPersonas", () => {
  it("returns exactly the seed personas, in order, when count <= seed count", () => {
    const personas = selectPersonas(3);
    expect(personas.map((p) => p.id)).toEqual(SEED_PERSONAS.slice(0, 3).map((p) => p.id));
  });

  it("cycles with a perturbed variant once past the seed list, never repeating an identical persona", () => {
    const count = SEED_PERSONAS.length + 2;
    const personas = selectPersonas(count);
    expect(personas).toHaveLength(count);
    const ids = personas.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(personas[SEED_PERSONAS.length]?.id).toBe(`${SEED_PERSONAS[0]?.id}-v1`);
  });

  it("is deterministic across calls", () => {
    const a = selectPersonas(10).map((p) => p.id);
    const b = selectPersonas(10).map((p) => p.id);
    expect(a).toEqual(b);
  });
});
