/**
 * Purpose: unit tests for the research-task Zod boundary — whitelist enforcement
 * (unknown functions rejected), display/call index integrity, envelope shape.
 */
import { describe, expect, it } from "vitest";
import { parseSignedResearchTask, researchTaskSchema } from "./taskSchema";

const validTask = {
  id: "sample-study",
  institution: "Test University",
  title: "Encounter distribution",
  purpose: "Understand how re-encounters distribute across concepts for spacing research.",
  calls: [{ fn: "count", metric: "concepts_known" }],
  display: [{ kind: "stat", label: "concepts", callIndex: 0 }],
  expiresAt: "2030-01-01",
};

describe("research task schema", () => {
  it("accepts a minimal valid task", () => {
    expect(researchTaskSchema.parse(validTask).id).toBe("sample-study");
  });

  it("rejects functions outside the whitelist", () => {
    const rogue = { ...validTask, calls: [{ fn: "raw_sql", query: "SELECT *" }] };
    expect(() => researchTaskSchema.parse(rogue)).toThrow();
  });

  it("rejects display blocks pointing at missing calls", () => {
    const dangling = {
      ...validTask,
      display: [{ kind: "stat", label: "x", callIndex: 3 }],
    };
    expect(() => researchTaskSchema.parse(dangling)).toThrow();
  });

  it("rejects out-of-range parameters on whitelisted functions", () => {
    const excessive = {
      ...validTask,
      calls: [{ fn: "histogram", metric: "encounters_per_node", bucketCount: 99 }],
    };
    expect(() => researchTaskSchema.parse(excessive)).toThrow();
  });

  it("rejects a correlation of a series with itself", () => {
    const selfPaired = {
      ...validTask,
      calls: [
        {
          fn: "correlation",
          xMetric: "daily_encounters",
          yMetric: "daily_encounters",
          windowDays: 60,
        },
      ],
    };
    expect(() => researchTaskSchema.parse(selfPaired)).toThrow();
  });

  it("rejects the mechanically coupled encounters × messages pair, in either order", () => {
    // Sightings are extracted from messages, so this correlation measures the extractor.
    for (const [xMetric, yMetric] of [
      ["daily_encounters", "daily_messages"],
      ["daily_messages", "daily_encounters"],
    ]) {
      const coupled = {
        ...validTask,
        calls: [{ fn: "correlation", xMetric, yMetric, windowDays: 60 }],
      };
      expect(() => researchTaskSchema.parse(coupled)).toThrow();
    }
  });

  it("accepts an independent metric pair over a long enough window", () => {
    const sound = {
      ...validTask,
      calls: [
        {
          fn: "correlation",
          xMetric: "daily_encounters",
          yMetric: "daily_word_events",
          windowDays: 60,
        },
      ],
    };
    expect(researchTaskSchema.parse(sound).calls).toHaveLength(1);
  });

  it("rejects a correlation window too short to ever clear the sample-size floor", () => {
    const tooShort = {
      ...validTask,
      calls: [
        {
          fn: "correlation",
          xMetric: "daily_encounters",
          yMetric: "daily_word_events",
          windowDays: 7,
        },
      ],
    };
    expect(() => researchTaskSchema.parse(tooShort)).toThrow();
  });

  it("rejects envelopes with malformed signatures", () => {
    expect(() => parseSignedResearchTask({ payload: validTask, signature: "not-hex" })).toThrow();
  });
});
