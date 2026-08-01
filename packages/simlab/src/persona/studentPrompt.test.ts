/**
 * Purpose: checks the student system prompt actually carries the tau-bench protocol
 * requirements — the competence-paradox constraint, the STOP token instruction, and that
 * every persona's own knowledge/behavior content shows up in its prompt.
 */
import { describe, expect, it } from "vitest";
import { SEED_PERSONAS } from "./seeds";
import { buildStudentSystemPrompt, STOP_TOKEN } from "./studentPrompt";

describe("buildStudentSystemPrompt", () => {
  it("includes the STOP token instruction and the competence-paradox constraint", () => {
    const persona = SEED_PERSONAS[0];
    if (persona === undefined) throw new Error("no seed persona");
    const prompt = buildStudentSystemPrompt(persona);
    expect(prompt).toContain(STOP_TOKEN);
    expect(prompt).toContain("能力悖论");
    expect(prompt).toContain("你每次只说一句话");
  });

  it("names every knownTopic, misconception and targetConcept for each seed persona", () => {
    for (const persona of SEED_PERSONAS) {
      const prompt = buildStudentSystemPrompt(persona);
      for (const topic of persona.knowledge.knownTopics) expect(prompt).toContain(topic);
      for (const misconception of persona.knowledge.misconceptions) {
        expect(prompt).toContain(misconception);
      }
      for (const target of persona.knowledge.targetConcepts) expect(prompt).toContain(target);
    }
  });

  it("STOP_TOKEN is exactly the literal the runner must match on", () => {
    expect(STOP_TOKEN).toBe("###STOP###");
  });
});
