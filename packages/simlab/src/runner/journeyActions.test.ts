/**
 * Purpose: unit tests for pickAndApplyJourneyAction's jump-new-domain hint binding (S3) —
 * create-goal idempotency (P6 mirror) lives in createGoalAction.test.ts and self-report
 * pending-topic requeue (S4) lives in selfReportAction.test.ts, mirroring the source split.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createTempDatabase, type TempDatabase } from "../db/sqliteClient";
import type { Persona } from "../persona/schema";
import { pickAndApplyJourneyAction } from "./journeyActions";

let temp: TempDatabase | null = null;

afterEach(() => {
  temp?.close();
  temp = null;
});

function goalMappingFetch(): typeof fetch {
  return (async () =>
    Response.json({
      choices: [{ message: { content: JSON.stringify({ existing: [], suggested: [] }) } }],
      usage: { prompt_tokens: 5, completion_tokens: 3 },
    })) as typeof fetch;
}

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
      pendingSelfReportTopics: new Set(),
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
      pendingSelfReportTopics: new Set(),
    });

    expect(result.actionType).toBe("jump-new-domain");
    expect(result.topicHint.domainHint).toBeNull();
  });
});
