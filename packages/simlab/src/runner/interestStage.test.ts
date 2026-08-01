/**
 * Purpose: unit tests for runInterestStage's retry-once-on-failure behavior (P5b) — a
 * parse/network failure on the first chatJson call must not drop the round's signal as
 * long as the retry succeeds, and two consecutive failures must still degrade silently.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createTempDatabase, type TempDatabase } from "../db/sqliteClient";
import { runInterestStage } from "./interestStage";
import type { PipelineFailure } from "./pipelineTypes";

let temp: TempDatabase | null = null;

afterEach(() => {
  temp?.close();
  temp = null;
});

function okResponse(): Response {
  return Response.json({
    choices: [
      {
        message: {
          content: JSON.stringify({
            signals: [{ label: "闭包", curiosity: 0.6, confusion: 0, boredom: 0, styles: [] }],
          }),
        },
      },
    ],
    usage: { prompt_tokens: 5, completion_tokens: 3 },
  });
}

describe("runInterestStage retry-once", () => {
  it("recovers when the first call throws and the retry succeeds", async () => {
    temp = await createTempDatabase();
    const now = "2026-08-01T10:00:00.000Z";
    await temp.repos.conversations.create({
      id: "conv-1",
      title: "t",
      created_at: now,
      updated_at: now,
    });
    await temp.repos.knowledgeNodes.insert({
      id: "n1",
      parent_id: null,
      label: "闭包",
      summary: "s",
      kind: "concept",
      created_at: now,
    });

    let callCount = 0;
    const fetchImpl = (async () => {
      callCount += 1;
      if (callCount === 1) throw new Error("network blip");
      return okResponse();
    }) as typeof fetch;

    const failures: PipelineFailure[] = [];
    await runInterestStage(
      {
        repos: temp.repos,
        conversationId: "conv-1",
        answerMessageId: "msg-1",
        userQuestion: "什么是闭包？",
        assistantAnswer: "闭包是……",
        nowIso: now,
        llmConfig: { baseUrl: "https://api.example.com/v1", apiKey: "k", model: "m", fetchImpl },
        recordCall: () => undefined,
        logStage: () => undefined,
      },
      [
        {
          id: "n1",
          parent_id: null,
          label: "闭包",
          summary: "s",
          kind: "concept",
          created_at: now,
        },
      ],
      [],
      failures,
    );

    expect(callCount).toBe(2);
    expect(failures).toEqual([]);
    const persisted = await temp.repos.interestSignals.listAll();
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.curiosity).toBe(0.6);
  });

  it("degrades silently (records one structured failure) when both attempts throw", async () => {
    temp = await createTempDatabase();
    const now = "2026-08-01T10:00:00.000Z";
    await temp.repos.conversations.create({
      id: "conv-1",
      title: "t",
      created_at: now,
      updated_at: now,
    });
    await temp.repos.knowledgeNodes.insert({
      id: "n1",
      parent_id: null,
      label: "闭包",
      summary: "s",
      kind: "concept",
      created_at: now,
    });

    let callCount = 0;
    const fetchImpl = (async () => {
      callCount += 1;
      throw new Error("still broken");
    }) as typeof fetch;

    const failures: PipelineFailure[] = [];
    await runInterestStage(
      {
        repos: temp.repos,
        conversationId: "conv-1",
        answerMessageId: "msg-1",
        userQuestion: "什么是闭包？",
        assistantAnswer: "闭包是……",
        nowIso: now,
        llmConfig: { baseUrl: "https://api.example.com/v1", apiKey: "k", model: "m", fetchImpl },
        recordCall: () => undefined,
        logStage: () => undefined,
      },
      [
        {
          id: "n1",
          parent_id: null,
          label: "闭包",
          summary: "s",
          kind: "concept",
          created_at: now,
        },
      ],
      [],
      failures,
    );

    expect(callCount).toBe(2);
    expect(failures).toEqual([{ purpose: "interest", error: expect.any(String) }]);
    const persisted = await temp.repos.interestSignals.listAll();
    expect(persisted).toEqual([]);
  });
});
