/**
 * Purpose: integration test for one round's full pipeline (extraction -> edge-judge ->
 * interest) against a real temp SQLite database, with a fake fetch dispatched by each LLM
 * call's distinct system prompt — no network, no API key required.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createTempDatabase, type TempDatabase } from "../db/sqliteClient";
import { runRoundPipeline } from "./pipeline";

let temp: TempDatabase | null = null;

afterEach(() => {
  temp?.close();
  temp = null;
});

function dispatchFetch(): typeof fetch {
  return (async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as {
      messages: { role: string; content: string }[];
    };
    const systemPrompt = body.messages[0]?.content ?? "";
    if (systemPrompt.includes("知识结构提取器")) {
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                nodes: [{ label: "闭包", summary: "函数记住定义时的作用域", parentLabel: null }],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 10 },
      });
    }
    if (systemPrompt.includes("知识关系判定器")) {
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                edges: [
                  {
                    pairId: "p0",
                    relation: "helps",
                    direction: null,
                    weight: 0.5,
                    confidence: 0.7,
                    reasoning: "闭包依赖作用域的概念",
                  },
                ],
                methodNodes: [],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 15, completion_tokens: 8 },
      });
    }
    if (systemPrompt.includes("学习心理观察者")) {
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                signals: [
                  { label: "闭包", curiosity: 0.6, confusion: 0.2, boredom: 0, styles: ["类比"] },
                ],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 6 },
      });
    }
    throw new Error(`unexpected system prompt: ${systemPrompt.slice(0, 40)}`);
  }) as typeof fetch;
}

describe("runRoundPipeline", () => {
  it("extracts a node, judges an edge to an existing node, and records an interest signal", async () => {
    temp = await createTempDatabase();
    const conversationId = "conv-1";
    const now = "2026-08-01T10:00:00.000Z";
    await temp.repos.conversations.create({
      id: conversationId,
      title: "t",
      created_at: now,
      updated_at: now,
    });
    await temp.repos.knowledgeNodes.insert({
      id: "existing-1",
      parent_id: null,
      label: "作用域",
      summary: "变量可见的范围",
      kind: "concept",
      created_at: now,
    });
    await temp.repos.messages.append({
      id: "msg-answer",
      conversation_id: conversationId,
      role: "assistant",
      content: "闭包是函数记住定义时作用域的能力。",
      created_at: now,
    });

    const calls: { purpose: string; model: string }[] = [];
    const stages: Record<string, unknown> = {};

    const result = await runRoundPipeline({
      repos: temp.repos,
      conversationId,
      answerMessageId: "msg-answer",
      userQuestion: "什么是闭包？",
      assistantAnswer: "闭包是函数记住定义时作用域的能力。",
      nowIso: now,
      llmConfig: {
        baseUrl: "https://api.example.com/v1",
        apiKey: "key",
        model: "test-model",
        fetchImpl: dispatchFetch(),
      },
      recordCall: (purpose, model) => calls.push({ purpose, model }),
      logStage: (record) => {
        stages[record.purpose as string] = record;
      },
    });

    expect(result.newNodes).toHaveLength(1);
    expect(result.newNodes[0]?.label).toBe("闭包");
    expect(result.failures).toEqual([]);
    expect(result.addedEdges).toHaveLength(1);
    expect(result.addedEdges[0]?.edge_type).toBe("helps");
    expect(calls.map((c) => c.purpose)).toEqual(["knowledge-tree", "knowledge-edges", "interest"]);

    const persistedNodes = await temp.repos.knowledgeNodes.listAll();
    expect(persistedNodes.map((n) => n.label).sort()).toEqual(["作用域", "闭包"]);
    const persistedEdges = await temp.repos.knowledgeEdges.listAll();
    expect(persistedEdges).toHaveLength(1);
    const persistedSignals = await temp.repos.interestSignals.listAll();
    expect(persistedSignals).toHaveLength(1);
    expect(persistedSignals[0]?.curiosity).toBe(0.6);
  });

  it("records a structured failure and keeps later stages from crashing when extraction returns invalid JSON", async () => {
    temp = await createTempDatabase();
    const conversationId = "conv-2";
    const now = "2026-08-01T10:00:00.000Z";
    await temp.repos.conversations.create({
      id: conversationId,
      title: "t",
      created_at: now,
      updated_at: now,
    });

    const badFetch = (async () =>
      Response.json({
        choices: [{ message: { content: JSON.stringify({ nodes: [{ label: "" }] }) } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      })) as typeof fetch;

    const result = await runRoundPipeline({
      repos: temp.repos,
      conversationId,
      answerMessageId: "msg-answer",
      userQuestion: "q",
      assistantAnswer: "a",
      nowIso: now,
      llmConfig: {
        baseUrl: "https://api.example.com/v1",
        apiKey: "key",
        model: "m",
        fetchImpl: badFetch,
      },
      recordCall: () => undefined,
      logStage: () => undefined,
    });

    expect(result.newNodes).toEqual([]);
    expect(result.failures).toEqual([{ purpose: "knowledge-tree", error: expect.any(String) }]);
  });
});
