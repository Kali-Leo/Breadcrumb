/**
 * Purpose: unit tests for runConversation's topic-hint/opener binding telemetry (S3) — a
 * concrete labeled hint (follow-frontier/revisit-old-topic) logs a soft mismatch event when
 * the student's actual opener never mentions it.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { TempDatabase } from "../db/sqliteClient";
import { SEED_PERSONAS } from "../persona/seeds";
import { STOP_TOKEN } from "../persona/studentPrompt";
import { runConversation } from "./conversation";
import { jsonCompletion, makeLog, setupConversation, sseFor } from "./conversationTestHelpers";
import { createCostGuard } from "./costGuard";

let temp: TempDatabase | null = null;

afterEach(() => {
  temp?.close();
  temp = null;
});

const persona = SEED_PERSONAS[0];
if (persona === undefined) throw new Error("no seed persona");

describe("runConversation topic-hint binding (S3)", () => {
  it("logs no mismatch when the student opener actually mentions the follow-frontier label", async () => {
    const setup = await setupConversation();
    temp = setup.temp;
    const fetchImpl = (async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { stream?: boolean };
      if (body.stream === true) return sseFor(STOP_TOKEN);
      return jsonCompletion({ nodes: [] });
    }) as typeof fetch;

    const log = makeLog();
    await runConversation({
      repos: setup.temp.repos,
      conversationId: setup.conversationId,
      persona,
      llmConfig: { baseUrl: "https://api.example.com/v1", apiKey: "k", model: "m", fetchImpl },
      costGuard: createCostGuard(1000),
      log,
      day: 0,
      maxRounds: 1,
      startIso: "2026-08-01T10:00:00.000Z",
      // Using the STOP token as the "hinted label" is a deliberate shortcut: the opener
      // exactly equals it, so it trivially satisfies the mention check while letting the
      // round end immediately (no need to also stub the tutor/pipeline for this case).
      topicHint: { label: STOP_TOKEN, isDomainJump: false },
    });

    expect(log.records.some((r) => r.event === "topic-hint-mismatch")).toBe(false);
  });

  it("logs a topic-hint-mismatch event when the student opener never mentions the hinted label", async () => {
    const setup = await setupConversation();
    temp = setup.temp;
    const fetchImpl = (async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { stream?: boolean };
      if (body.stream === true) return sseFor("完全不相关的开场白");
      return jsonCompletion({ nodes: [] });
    }) as typeof fetch;

    const log = makeLog();
    await runConversation({
      repos: setup.temp.repos,
      conversationId: setup.conversationId,
      persona,
      llmConfig: { baseUrl: "https://api.example.com/v1", apiKey: "k", model: "m", fetchImpl },
      costGuard: createCostGuard(1000),
      log,
      day: 0,
      maxRounds: 1,
      startIso: "2026-08-01T10:00:00.000Z",
      topicHint: { label: "贝叶斯定理", isDomainJump: false },
    });

    const mismatches = log.records.filter((r) => r.event === "topic-hint-mismatch");
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]?.expectedLabel).toBe("贝叶斯定理");
  });
});
