/**
 * Purpose: unit tests for applySelfReport's pending-topic requeue (S4) — a persona knownTopic
 * with no matching tree node yet is queued instead of dropped, and resolved later either by a
 * subsequent self-report action or by resolvePendingSelfReportTopics at day end.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createTempDatabase, type TempDatabase } from "../db/sqliteClient";
import type { Persona } from "../persona/schema";
import type { JourneyActionContext } from "./journeyActionTypes";
import { applySelfReport, resolvePendingSelfReportTopics } from "./selfReportAction";

let temp: TempDatabase | null = null;

afterEach(() => {
  temp?.close();
  temp = null;
});

const reportingPersona: Persona = {
  id: "p3",
  name: "test",
  description: "test persona",
  knowledge: { knownTopics: ["加法", "乘法"], misconceptions: [], targetConcepts: ["分数"] },
  behavior: {
    typoRate: 0,
    codeSwitching: 0,
    driftTendency: 0,
    boredomThreshold: 0.5,
    confusionTendency: 0.5,
  },
};

function neverCalledFetch(): typeof fetch {
  return (async () => {
    throw new Error("self-report LLM should not be called against an empty tree");
  }) as typeof fetch;
}

function emptyMappingFetch(): typeof fetch {
  return (async () =>
    Response.json({
      choices: [{ message: { content: JSON.stringify({ mappings: [] }) } }],
      usage: { prompt_tokens: 5, completion_tokens: 3 },
    })) as typeof fetch;
}

function makeContext(overrides: Partial<JourneyActionContext> = {}): JourneyActionContext {
  if (temp === null) throw new Error("temp db not initialized");
  return {
    repos: temp.repos,
    persona: reportingPersona,
    llmConfig: {
      baseUrl: "https://api.example.com/v1",
      apiKey: "k",
      model: "m",
      fetchImpl: neverCalledFetch(),
    },
    nowIso: "2026-08-01T10:00:00.000Z",
    random: () => 0,
    recordCall: () => undefined,
    logStage: () => undefined,
    touchedLabelsSoFar: [],
    pendingSelfReportTopics: new Set(),
    ...overrides,
  };
}

describe("applySelfReport pending-topic requeue (S4)", () => {
  it("queues every knownTopic instead of dropping it when the tree is still empty", async () => {
    temp = await createTempDatabase();
    const pendingSelfReportTopics = new Set<string>();

    await applySelfReport(makeContext({ pendingSelfReportTopics }));

    expect(pendingSelfReportTopics).toEqual(new Set(["加法", "乘法"]));
    expect(await temp.repos.masteryClaims.listAll()).toEqual([]);
  });

  it("resolves a pending topic once its node exists, on the next self-report action", async () => {
    temp = await createTempDatabase();
    const pendingSelfReportTopics = new Set<string>(["加法", "乘法"]);
    await temp.repos.knowledgeNodes.insert({
      id: "n-add",
      parent_id: null,
      label: "加法",
      summary: "s",
      kind: "concept",
      created_at: "2026-08-01T09:00:00.000Z",
    });

    const stageRecords: Record<string, unknown>[] = [];
    await applySelfReport(
      makeContext({
        pendingSelfReportTopics,
        nowIso: "2026-08-01T11:00:00.000Z",
        llmConfig: {
          baseUrl: "https://api.example.com/v1",
          apiKey: "k",
          model: "m",
          fetchImpl: emptyMappingFetch(),
        },
        logStage: (record) => stageRecords.push(record),
      }),
    );

    expect(pendingSelfReportTopics.has("加法")).toBe(false);
    expect(pendingSelfReportTopics.has("乘法")).toBe(true);
    const claims = await temp.repos.masteryClaims.listAll();
    expect(claims).toHaveLength(1);
    expect(claims[0]?.node_id).toBe("n-add");
    expect(claims[0]?.source).toBe("self-report");
    expect(
      stageRecords.some((r) => r.event === "self-report-pending-resolved" && r.label === "加法"),
    ).toBe(true);
  });

  it("resolvePendingSelfReportTopics resolves at day end without any journey action firing", async () => {
    temp = await createTempDatabase();
    const pendingSelfReportTopics = new Set<string>(["加法"]);
    await temp.repos.knowledgeNodes.insert({
      id: "n-add",
      parent_id: null,
      label: "加法",
      summary: "s",
      kind: "concept",
      created_at: "2026-08-01T09:00:00.000Z",
    });

    const resolved: string[] = [];
    await resolvePendingSelfReportTopics(
      pendingSelfReportTopics,
      temp.repos,
      "2026-08-01T12:00:00.000Z",
      (label) => resolved.push(label),
    );

    expect(resolved).toEqual(["加法"]);
    expect(pendingSelfReportTopics.size).toBe(0);
    const claims = await temp.repos.masteryClaims.listAll();
    expect(claims).toHaveLength(1);
    expect(claims[0]?.level).toBe("learned");
  });
});
