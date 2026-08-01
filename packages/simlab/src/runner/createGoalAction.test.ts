/**
 * Purpose: unit tests for applyCreateGoal's title idempotency (P6 mirror) — running the same
 * goal text twice must update the one existing goal row instead of inserting a duplicate
 * card with the same title.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createTempDatabase, type TempDatabase } from "../db/sqliteClient";
import type { Persona } from "../persona/schema";
import { applyCreateGoal } from "./createGoalAction";
import type { JourneyActionContext } from "./journeyActionTypes";

let temp: TempDatabase | null = null;

afterEach(() => {
  temp?.close();
  temp = null;
});

const persona: Persona = {
  id: "p1",
  name: "test",
  description: "test persona",
  knowledge: { knownTopics: [], misconceptions: [], targetConcepts: ["闭包"] },
  behavior: {
    typoRate: 0,
    codeSwitching: 0,
    driftTendency: 0,
    boredomThreshold: 0.5,
    confusionTendency: 0.5,
  },
};

function goalMappingFetch(): typeof fetch {
  return (async () =>
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({ existing: [], suggested: [{ label: "闭包", summary: "s" }] }),
          },
        },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 3 },
    })) as typeof fetch;
}

function makeContext(nowIso: string): JourneyActionContext {
  if (temp === null) throw new Error("temp db not initialized");
  return {
    repos: temp.repos,
    persona,
    llmConfig: {
      baseUrl: "https://api.example.com/v1",
      apiKey: "k",
      model: "m",
      fetchImpl: goalMappingFetch(),
    },
    nowIso,
    random: () => 0,
    recordCall: () => undefined,
    logStage: () => undefined,
    touchedLabelsSoFar: [],
    pendingSelfReportTopics: new Set(),
  };
}

describe("applyCreateGoal idempotency", () => {
  it("updates the existing goal instead of inserting a duplicate on repeated identical goal text", async () => {
    temp = await createTempDatabase();

    await applyCreateGoal(makeContext("2026-08-01T10:00:00.000Z"));
    await applyCreateGoal(makeContext("2026-08-01T11:00:00.000Z"));

    const goals = await temp.repos.goals.listAll();
    expect(goals).toHaveLength(1);
    expect(goals[0]?.updated_at).toBe("2026-08-01T11:00:00.000Z");
    expect(goals[0]?.created_at).toBe("2026-08-01T10:00:00.000Z");
  });
});
