/**
 * Purpose: guards the suite's two structural promises — every purpose the bench claims to
 * cover has enough scenarios for a rate to mean anything, and building it twice produces
 * exactly the same prompts. Determinism is the whole reason these scenarios come from
 * repository data rather than from a model.
 */
import { describe, expect, it } from "vitest";
import { BENCH_PURPOSES, buildBenchScenarios, filterScenarios, scenariosByPurpose } from "./index";

const scenarios = buildBenchScenarios();
const byPurpose = scenariosByPurpose(scenarios);

/** Below this many scenarios a pass rate is anecdote, not measurement. */
const MIN_PER_PURPOSE = 25;

describe("bench scenario suite", () => {
  it("covers every purpose the report has a row for", () => {
    expect([...byPurpose.keys()].sort()).toEqual([...BENCH_PURPOSES].sort());
  });

  it("gives each purpose at least 25 scenarios", () => {
    for (const [purpose, list] of byPurpose) {
      expect(list.length, `${purpose} has too few scenarios`).toBeGreaterThanOrEqual(
        MIN_PER_PURPOSE,
      );
    }
  });

  it("keeps scenario ids unique", () => {
    expect(new Set(scenarios.map((scenario) => scenario.id)).size).toBe(scenarios.length);
  });

  it("builds the identical suite twice", () => {
    const again = buildBenchScenarios();
    expect(again.map((scenario) => scenario.id)).toEqual(scenarios.map((scenario) => scenario.id));
    expect(again.map((scenario) => JSON.stringify(scenario.messages))).toEqual(
      scenarios.map((scenario) => JSON.stringify(scenario.messages)),
    );
  });

  it("sends a non-empty prompt for every scenario", () => {
    for (const scenario of scenarios) {
      expect(scenario.messages.length, scenario.id).toBeGreaterThan(0);
      for (const message of scenario.messages) {
        expect(message.content.trim().length, scenario.id).toBeGreaterThan(0);
      }
    }
  });

  it("spreads the language-sensitive purposes across every interface language", () => {
    for (const purpose of ["knowledge-tree", "interest", "chat", "companion-chat"]) {
      const languages = new Set(
        (byPurpose.get(purpose) ?? []).map((scenario) => scenario.language),
      );
      expect(languages.size, purpose).toBeGreaterThanOrEqual(11);
    }
  });

  it("filters by purpose and caps per purpose", () => {
    const limited = filterScenarios(scenarios, { purposes: ["interest"], limitPerPurpose: 4 });
    expect(limited).toHaveLength(4);
    expect(limited.every((scenario) => scenario.purpose === "interest")).toBe(true);
  });
});

describe("scenario scoring closures", () => {
  it("scores a reply the schema accepts and rejects one it does not", () => {
    const scenario = byPurpose.get("knowledge-tree")?.[0];
    if (scenario === undefined || scenario.kind !== "json") throw new Error("no json scenario");
    const reply = {
      nodes: [{ label: "闭包", summary: "函数记住定义时的作用域。", parentLabel: null }],
    };
    expect(scenario.check(reply).parentGrounded).toBe(1);
    expect(scenario.agree(reply, reply)).toBe(1);
    expect(() => scenario.check({ nodes: [{ label: "" }] })).toThrow();
  });

  it("scores an edge batch against its hand-authored expectations", () => {
    const scenario = byPurpose.get("knowledge-edges")?.[0];
    if (scenario === undefined || scenario.kind !== "json") throw new Error("no edge scenario");
    const empty = { edges: [], methodNodes: [], adjacentConcepts: [] };
    // A model that judges nothing gets no credit for the pairs it never answered.
    expect(scenario.check(empty).goldAccuracy).toBe(0);
    expect(scenario.check(empty).pairCoverage).toBe(0);
  });
});
