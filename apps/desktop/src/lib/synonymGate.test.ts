/**
 * Purpose: unit tests for runSynonymGate (spec 015 desktop wiring) — candidate filtering,
 * 同一/不同/degraded verdict branches, and that a gate failure never throws (mocks embedTexts,
 * the DB, metering, failure logging, and chatJson).
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { afterEach, describe, expect, it, vi } from "vitest";

const listAllMock = vi.fn();
const insertNodeAliasMock = vi.fn();
vi.mock("./db", () => ({
  getRepos: vi.fn(async () => ({
    nodeEmbeddings: { listAll: listAllMock },
    nodeAliases: { insert: insertNodeAliasMock },
  })),
}));

const embedTextsMock = vi.fn();
vi.mock("./embeddings", () => ({ embedTexts: embedTextsMock }));

const recordAiFailureMock = vi.fn();
vi.mock("./failureLog", () => ({ recordAiFailure: recordAiFailureMock }));

const recordMeteredCallMock = vi.fn();
vi.mock("./metering", () => ({ recordMeteredCall: recordMeteredCallMock }));

const chatJsonMock = vi.fn();
vi.mock("@breadcrumb/core-llm", async () => {
  const actual =
    await vi.importActual<typeof import("@breadcrumb/core-llm")>("@breadcrumb/core-llm");
  return { ...actual, chatJson: chatJsonMock };
});

const { runSynonymGate } = await import("./synonymGate");

afterEach(() => {
  listAllMock.mockReset();
  insertNodeAliasMock.mockReset();
  embedTextsMock.mockReset();
  recordAiFailureMock.mockReset();
  recordMeteredCallMock.mockReset();
  chatJsonMock.mockReset();
});

const config = { baseUrl: "https://api.example.com/v1", apiKey: "k", model: "m", fetchImpl: fetch };

function newNode(id: string, label: string, summary: string): KnowledgeNodeRow {
  return { id, parent_id: null, label, summary, kind: "concept", created_at: "t" };
}

describe("runSynonymGate", () => {
  it("passes the plan through when there are no new nodes", async () => {
    const plan = { newNodes: [], sightings: [] };
    const result = await runSynonymGate({
      plan,
      existingNodes: [],
      conversationId: "conv-1",
      sourceMessageId: "msg-1",
      config,
    });
    expect(result).toEqual({ newNodes: [], sightings: [], aliasesToInsert: [] });
    expect(embedTextsMock).not.toHaveBeenCalled();
  });

  it("degrades to the pre-gate plan when embeddings are unavailable (no Rust model)", async () => {
    embedTextsMock.mockResolvedValueOnce(null);
    const plan = {
      newNodes: [newNode("new-1", "if缩进", "s")],
      sightings: [
        {
          id: "s1",
          node_id: "new-1",
          conversation_id: "conv-1",
          message_id: "msg-1",
          created_at: "t",
        },
      ],
    };
    const result = await runSynonymGate({
      plan,
      existingNodes: [],
      conversationId: "conv-1",
      sourceMessageId: "msg-1",
      config,
    });
    expect(result).toEqual({ ...plan, aliasesToInsert: [] });
    expect(chatJsonMock).not.toHaveBeenCalled();
    expect(recordAiFailureMock).not.toHaveBeenCalled();
  });

  it("passes through when no existing embedding is similar enough", async () => {
    embedTextsMock.mockResolvedValueOnce([[1, 0]]);
    listAllMock.mockResolvedValueOnce([
      { node_id: "existing-1", model: "m", vector_json: JSON.stringify([0, 1]), created_at: "t" },
    ]);
    const plan = {
      newNodes: [newNode("new-1", "if缩进", "s")],
      sightings: [
        {
          id: "s1",
          node_id: "new-1",
          conversation_id: "conv-1",
          message_id: "msg-1",
          created_at: "t",
        },
      ],
    };
    const result = await runSynonymGate({
      plan,
      existingNodes: [newNode("existing-1", "别的东西", "s2")],
      conversationId: "conv-1",
      sourceMessageId: "msg-1",
      config,
    });
    expect(result).toEqual({ ...plan, aliasesToInsert: [] });
    expect(chatJsonMock).not.toHaveBeenCalled();
  });

  it("同一 verdict: drops the new node, redirects the sighting, and returns an alias to insert", async () => {
    embedTextsMock.mockResolvedValueOnce([[1, 0]]);
    listAllMock.mockResolvedValueOnce([
      { node_id: "existing-1", model: "m", vector_json: JSON.stringify([1, 0]), created_at: "t" },
    ]);
    chatJsonMock.mockResolvedValueOnce({
      parsed: { verdicts: [{ pairId: "p0", verdict: "同一" }] },
      usage: { inputTokens: 5, outputTokens: 3 },
    });
    const plan = {
      newNodes: [newNode("new-1", "if缩进", "s")],
      sightings: [
        {
          id: "s1",
          node_id: "new-1",
          conversation_id: "conv-1",
          message_id: "msg-1",
          created_at: "t",
        },
      ],
    };
    const result = await runSynonymGate({
      plan,
      existingNodes: [newNode("existing-1", "if语句为什么要缩进", "s2")],
      conversationId: "conv-1",
      sourceMessageId: "msg-1",
      config,
    });
    expect(result.newNodes).toHaveLength(0);
    expect(result.sightings.map((s) => s.node_id)).toEqual(["existing-1"]);
    expect(result.aliasesToInsert).toEqual([
      { alias_label: "if缩进", node_id: "existing-1", created_at: expect.any(String) },
    ]);
    expect(recordMeteredCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "knowledge-tree", conversationId: "conv-1" }),
    );
  });

  it("不同 verdict: leaves the plan untouched", async () => {
    embedTextsMock.mockResolvedValueOnce([[1, 0]]);
    listAllMock.mockResolvedValueOnce([
      { node_id: "existing-1", model: "m", vector_json: JSON.stringify([1, 0]), created_at: "t" },
    ]);
    chatJsonMock.mockResolvedValueOnce({
      parsed: { verdicts: [{ pairId: "p0", verdict: "不同" }] },
      usage: { inputTokens: 5, outputTokens: 3 },
    });
    const plan = {
      newNodes: [newNode("new-1", "if冒号必须", "s")],
      sightings: [
        {
          id: "s1",
          node_id: "new-1",
          conversation_id: "conv-1",
          message_id: "msg-1",
          created_at: "t",
        },
      ],
    };
    const result = await runSynonymGate({
      plan,
      existingNodes: [newNode("existing-1", "if语句为什么要缩进", "s2")],
      conversationId: "conv-1",
      sourceMessageId: "msg-1",
      config,
    });
    expect(result.newNodes).toEqual(plan.newNodes);
    expect(result.sightings).toEqual(plan.sightings);
    expect(result.aliasesToInsert).toEqual([]);
  });

  it("degrades to the pre-gate plan and records one ai_failures row when the LLM call throws", async () => {
    embedTextsMock.mockResolvedValueOnce([[1, 0]]);
    listAllMock.mockResolvedValueOnce([
      { node_id: "existing-1", model: "m", vector_json: JSON.stringify([1, 0]), created_at: "t" },
    ]);
    chatJsonMock.mockRejectedValueOnce(new Error("network blip"));
    const plan = {
      newNodes: [newNode("new-1", "if缩进", "s")],
      sightings: [
        {
          id: "s1",
          node_id: "new-1",
          conversation_id: "conv-1",
          message_id: "msg-1",
          created_at: "t",
        },
      ],
    };
    const result = await runSynonymGate({
      plan,
      existingNodes: [newNode("existing-1", "if语句为什么要缩进", "s2")],
      conversationId: "conv-1",
      sourceMessageId: "msg-1",
      config,
    });
    expect(result).toEqual({ ...plan, aliasesToInsert: [] });
    expect(recordAiFailureMock).toHaveBeenCalledWith("knowledge-tree", expect.any(Error));
  });
});
