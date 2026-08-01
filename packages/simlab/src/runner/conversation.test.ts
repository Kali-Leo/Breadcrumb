/**
 * Purpose: unit tests for runConversation's empty-turn guard (S1) — a student or tutor reply
 * that trims to empty is retried once; if still empty the conversation ends early with a
 * logged "degenerate-turn" event, and the empty turn never reaches the pipeline (no extraction
 * call, no message persisted for that side).
 */
import { afterEach, describe, expect, it } from "vitest";
import { createTempDatabase, type TempDatabase } from "../db/sqliteClient";
import { SEED_PERSONAS } from "../persona/seeds";
import { STOP_TOKEN } from "../persona/studentPrompt";
import { runConversation } from "./conversation";
import { createCostGuard } from "./costGuard";

let temp: TempDatabase | null = null;

afterEach(() => {
  temp?.close();
  temp = null;
});

const persona = SEED_PERSONAS[0];
if (persona === undefined) throw new Error("no seed persona");

function sseFor(content: string): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: {"choices":[{"delta":{"content":${JSON.stringify(content)}}}]}\n`),
      );
      controller.enqueue(encoder.encode("data: [DONE]\n"));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

function jsonCompletion(content: unknown): Response {
  return Response.json({
    choices: [{ message: { content: JSON.stringify(content) } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  });
}

function makeLog(): {
  path: string;
  writeLine: (record: unknown) => void;
  records: Record<string, unknown>[];
} {
  const records: Record<string, unknown>[] = [];
  return {
    path: "/dev/null",
    writeLine: (record) => records.push(record as Record<string, unknown>),
    records,
  };
}

async function setupConversation(): Promise<{ temp: TempDatabase; conversationId: string }> {
  const db = await createTempDatabase();
  const now = "2026-08-01T10:00:00.000Z";
  const conversationId = "conv-1";
  await db.repos.conversations.create({
    id: conversationId,
    title: "t",
    created_at: now,
    updated_at: now,
  });
  return { temp: db, conversationId };
}

describe("runConversation empty-turn guard", () => {
  it("retries a student reply once when empty, and proceeds normally once non-empty", async () => {
    const setup = await setupConversation();
    temp = setup.temp;
    let studentCalls = 0;

    const fetchImpl = (async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as {
        stream?: boolean;
        messages: { role: string; content: string }[];
      };
      if (body.stream === true) {
        const isStudent = body.messages[0]?.role === "system";
        if (isStudent) {
          studentCalls += 1;
          return studentCalls === 1 ? sseFor("") : sseFor(STOP_TOKEN);
        }
        return sseFor("讲解内容");
      }
      throw new Error(`unexpected non-streaming call: ${String(init?.body)}`);
    }) as typeof fetch;

    const log = makeLog();
    const result = await runConversation({
      repos: setup.temp.repos,
      conversationId: setup.conversationId,
      persona,
      llmConfig: { baseUrl: "https://api.example.com/v1", apiKey: "k", model: "m", fetchImpl },
      costGuard: createCostGuard(1000),
      log,
      day: 0,
      maxRounds: 3,
      startIso: "2026-08-01T10:00:00.000Z",
    });

    expect(studentCalls).toBe(2); // one empty, one retry
    expect(result.stopReason).toBe("stop-token");
    expect(log.records.some((r) => r.event === "degenerate-turn")).toBe(false);
  });

  it("ends the conversation early with a degenerate-turn event when the student reply is empty twice", async () => {
    const setup = await setupConversation();
    temp = setup.temp;
    let studentCalls = 0;
    let pipelineCalled = false;

    const fetchImpl = (async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as {
        stream?: boolean;
        messages: { role: string; content: string }[];
      };
      if (body.stream === true) {
        const isStudent = body.messages[0]?.role === "system";
        if (isStudent) {
          studentCalls += 1;
          return sseFor("");
        }
        return sseFor("讲解内容");
      }
      pipelineCalled = true;
      return jsonCompletion({ nodes: [] });
    }) as typeof fetch;

    const log = makeLog();
    const result = await runConversation({
      repos: setup.temp.repos,
      conversationId: setup.conversationId,
      persona,
      llmConfig: { baseUrl: "https://api.example.com/v1", apiKey: "k", model: "m", fetchImpl },
      costGuard: createCostGuard(1000),
      log,
      day: 0,
      maxRounds: 3,
      startIso: "2026-08-01T10:00:00.000Z",
    });

    expect(studentCalls).toBe(2);
    expect(result.stopReason).toBe("degenerate-turn");
    expect(result.rounds).toBe(0);
    expect(pipelineCalled).toBe(false);
    const degenerateEvents = log.records.filter((r) => r.event === "degenerate-turn");
    expect(degenerateEvents).toHaveLength(1);
    expect(degenerateEvents[0]?.source).toBe("student");
    const messages = await setup.temp.repos.messages.listByConversation(setup.conversationId);
    expect(messages).toEqual([]);
  });

  it("ends the conversation early with a degenerate-turn event when the tutor reply is empty twice, keeping the student message but never reaching the pipeline", async () => {
    const setup = await setupConversation();
    temp = setup.temp;
    let tutorCalls = 0;
    let pipelineCalled = false;

    const fetchImpl = (async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as {
        stream?: boolean;
        messages: { role: string; content: string }[];
      };
      if (body.stream === true) {
        const isStudent = body.messages[0]?.role === "system";
        if (isStudent) return sseFor("这是什么意思？");
        tutorCalls += 1;
        return sseFor("");
      }
      pipelineCalled = true;
      return jsonCompletion({ nodes: [] });
    }) as typeof fetch;

    const log = makeLog();
    const result = await runConversation({
      repos: setup.temp.repos,
      conversationId: setup.conversationId,
      persona,
      llmConfig: { baseUrl: "https://api.example.com/v1", apiKey: "k", model: "m", fetchImpl },
      costGuard: createCostGuard(1000),
      log,
      day: 0,
      maxRounds: 3,
      startIso: "2026-08-01T10:00:00.000Z",
    });

    expect(tutorCalls).toBe(2);
    expect(result.stopReason).toBe("degenerate-turn");
    expect(pipelineCalled).toBe(false);
    const degenerateEvents = log.records.filter((r) => r.event === "degenerate-turn");
    expect(degenerateEvents).toHaveLength(1);
    expect(degenerateEvents[0]?.source).toBe("tutor");
    const messages = await setup.temp.repos.messages.listByConversation(setup.conversationId);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe("user");
  });
});

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
