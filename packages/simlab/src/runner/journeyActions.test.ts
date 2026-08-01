/**
 * Purpose: unit tests for journeyActions' create-goal idempotency guard (P6 mirror) — running
 * the same goal text twice must update the one existing goal row instead of inserting a
 * duplicate card with the same title.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createTempDatabase, type TempDatabase } from "../db/sqliteClient";
import type { Persona } from "../persona/schema";
import { type JourneyActionContext, pickAndApplyJourneyAction } from "./journeyActions";

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
    // 0.55 rolls into the "create-goal" bucket of ACTION_WEIGHTS (cumulative 0.5-0.65).
    random: () => 0.55,
    recordCall: () => undefined,
    logStage: () => undefined,
    touchedLabelsSoFar: [],
  };
}

describe("pickAndApplyJourneyAction create-goal idempotency", () => {
  it("updates the existing goal instead of inserting a duplicate on repeated identical goal text", async () => {
    temp = await createTempDatabase();

    const first = await pickAndApplyJourneyAction(makeContext("2026-08-01T10:00:00.000Z"));
    expect(first.actionType).toBe("create-goal");
    const second = await pickAndApplyJourneyAction(makeContext("2026-08-01T11:00:00.000Z"));
    expect(second.actionType).toBe("create-goal");

    const goals = await temp.repos.goals.listAll();
    expect(goals).toHaveLength(1);
    expect(goals[0]?.updated_at).toBe("2026-08-01T11:00:00.000Z");
    expect(goals[0]?.created_at).toBe("2026-08-01T10:00:00.000Z");
  });
});

describe("pickAndApplyJourneyAction jump-new-domain (S3)", () => {
  const domainPersona: Persona = {
    id: "p2",
    name: "test",
    description: "test persona",
    knowledge: { knownTopics: ["A", "B"], misconceptions: [], targetConcepts: ["C"] },
    behavior: {
      typoRate: 0,
      codeSwitching: 0,
      driftTendency: 0,
      boredomThreshold: 0.5,
      confusionTendency: 0.5,
    },
  };

  it("picks an untouched-domain label from the persona brief, excluding touched labels", async () => {
    temp = await createTempDatabase();
    const result = await pickAndApplyJourneyAction({
      repos: temp.repos,
      persona: domainPersona,
      llmConfig: {
        baseUrl: "https://api.example.com/v1",
        apiKey: "k",
        model: "m",
        fetchImpl: goalMappingFetch(),
      },
      nowIso: "2026-08-01T10:00:00.000Z",
      // 0.9 rolls into the "jump-new-domain" bucket (cumulative 0.85-1.0); reused for the
      // domain-hint index pick too, deterministically landing on the last candidate.
      random: () => 0.9,
      recordCall: () => undefined,
      logStage: () => undefined,
      touchedLabelsSoFar: ["A"],
    });

    expect(result.actionType).toBe("jump-new-domain");
    expect(result.topicHint.isDomainJump).toBe(true);
    expect(result.topicHint.domainHint).not.toBeNull();
    expect(["B", "C"]).toContain(result.topicHint.domainHint);
    expect(result.topicHint.domainHint).not.toBe("A"); // touched label must be excluded
  });

  it("falls back to a null domainHint once the whole persona brief has been touched", async () => {
    temp = await createTempDatabase();
    const result = await pickAndApplyJourneyAction({
      repos: temp.repos,
      persona: domainPersona,
      llmConfig: {
        baseUrl: "https://api.example.com/v1",
        apiKey: "k",
        model: "m",
        fetchImpl: goalMappingFetch(),
      },
      nowIso: "2026-08-01T10:00:00.000Z",
      random: () => 0.9,
      recordCall: () => undefined,
      logStage: () => undefined,
      touchedLabelsSoFar: ["A", "B", "C"],
    });

    expect(result.actionType).toBe("jump-new-domain");
    expect(result.topicHint.domainHint).toBeNull();
  });
});
