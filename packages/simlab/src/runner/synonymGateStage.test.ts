/**
 * Purpose: unit tests for runSynonymGateStage (spec 015) — candidate filtering by synthetic
 * embedding similarity, and the 同一/不同/degraded verdict branches, against a real temp
 * SQLite database for node_embeddings.
 */

import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import type { NodeChangePlan } from "@breadcrumb/plugin-knowledge-tree";
import { afterEach, describe, expect, it } from "vitest";
import { createTempDatabase, type TempDatabase } from "../db/sqliteClient";
import {
  computeSyntheticNodeEmbedding,
  SYNTHETIC_EMBEDDING_MODEL,
} from "../embedding/syntheticEmbedding";
import type { PipelineFailure, RoundPipelineInput } from "./pipelineTypes";
import { runSynonymGateStage } from "./synonymGateStage";

let temp: TempDatabase | null = null;

afterEach(() => {
  temp?.close();
  temp = null;
});

const now = "2026-08-03T10:00:00.000Z";

function existingNode(id: string, label: string, summary: string): KnowledgeNodeRow {
  return { id, parent_id: null, label, summary, kind: "concept", created_at: now };
}

async function setupBase(): Promise<TempDatabase> {
  const db = await createTempDatabase();
  await db.repos.conversations.create({
    id: "conv-1",
    title: "t",
    created_at: now,
    updated_at: now,
    kind: "chat",
  });
  return db;
}

function baseInput(
  fetchImpl: typeof fetch,
  recordCall: RoundPipelineInput["recordCall"],
): RoundPipelineInput {
  return {
    repos: temp?.repos as RoundPipelineInput["repos"],
    conversationId: "conv-1",
    answerMessageId: "msg-1",
    userQuestion: "q",
    assistantAnswer: "a",
    nowIso: now,
    llmConfig: { baseUrl: "https://api.example.com/v1", apiKey: "k", model: "m", fetchImpl },
    recordCall,
    logStage: () => undefined,
  };
}

describe("runSynonymGateStage", () => {
  it("passes the plan through unchanged when there are no new nodes", async () => {
    temp = await setupBase();
    const plan: NodeChangePlan = { newNodes: [], sightings: [] };
    const failures: PipelineFailure[] = [];
    const result = await runSynonymGateStage(
      baseInput(
        (() => {
          throw new Error("should not be called");
        }) as unknown as typeof fetch,
        () => undefined,
      ),
      plan,
      [],
      failures,
    );
    expect(result).toEqual({ newNodes: [], sightings: [], aliasesToInsert: [] });
  });

  it("passes through when no existing embedding is similar enough", async () => {
    temp = await setupBase();
    const existing = existingNode("existing-1", "作用域", "变量可见的范围");
    await temp.repos.knowledgeNodes.insert(existing);
    await temp.repos.nodeEmbeddings.upsert({
      node_id: existing.id,
      model: SYNTHETIC_EMBEDDING_MODEL,
      vector_json: JSON.stringify(computeSyntheticNodeEmbedding(existing.label, existing.summary)),
      created_at: now,
    });
    const newNode = existingNode("new-1", "完全不相关的概念xyz", "一个完全无关的东西");
    const plan: NodeChangePlan = {
      newNodes: [newNode],
      sightings: [
        {
          id: "s1",
          node_id: "new-1",
          conversation_id: "conv-1",
          message_id: "msg-1",
          created_at: now,
          origin_node_id: null,
        },
      ],
    };
    const failures: PipelineFailure[] = [];
    const fetchImpl = (async () => {
      throw new Error("should not be called");
    }) as typeof fetch;
    const result = await runSynonymGateStage(
      baseInput(fetchImpl, () => undefined),
      plan,
      [existing],
      failures,
    );
    expect(result).toEqual({ ...plan, aliasesToInsert: [] });
    expect(failures).toEqual([]);
  });

  it("同一 verdict: drops the new node, redirects the sighting, writes an alias", async () => {
    temp = await setupBase();
    const existing = existingNode("existing-1", "if语句为什么要缩进", "缩进决定代码块归属");
    await temp.repos.knowledgeNodes.insert(existing);
    await temp.repos.nodeEmbeddings.upsert({
      node_id: existing.id,
      model: SYNTHETIC_EMBEDDING_MODEL,
      vector_json: JSON.stringify(computeSyntheticNodeEmbedding(existing.label, existing.summary)),
      created_at: now,
    });
    // Same label+summary as the existing node -> synthetic embedding is identical (similarity 1).
    const newNode = existingNode("new-1", existing.label, existing.summary);
    const plan: NodeChangePlan = {
      newNodes: [newNode],
      sightings: [
        {
          id: "s1",
          node_id: "new-1",
          conversation_id: "conv-1",
          message_id: "msg-1",
          created_at: now,
          origin_node_id: null,
        },
      ],
    };
    const calls: string[] = [];
    const fetchImpl = (async () =>
      Response.json({
        choices: [
          {
            message: { content: JSON.stringify({ verdicts: [{ pairId: "p0", verdict: "同一" }] }) },
          },
        ],
        usage: { prompt_tokens: 3, completion_tokens: 2 },
      })) as typeof fetch;
    const failures: PipelineFailure[] = [];
    const result = await runSynonymGateStage(
      baseInput(fetchImpl, (purpose) => calls.push(purpose)),
      plan,
      [existing],
      failures,
    );
    expect(result.newNodes).toHaveLength(0);
    expect(result.sightings.map((s) => s.node_id)).toEqual(["existing-1"]);
    expect(result.aliasesToInsert).toEqual([
      { alias_label: existing.label, node_id: "existing-1", created_at: now },
    ]);
    expect(calls).toEqual(["knowledge-tree"]);
    expect(failures).toEqual([]);
  });

  it("不同 verdict: leaves the plan untouched", async () => {
    temp = await setupBase();
    const existing = existingNode("existing-1", "if语句为什么要缩进", "缩进决定代码块归属");
    await temp.repos.knowledgeNodes.insert(existing);
    await temp.repos.nodeEmbeddings.upsert({
      node_id: existing.id,
      model: SYNTHETIC_EMBEDDING_MODEL,
      vector_json: JSON.stringify(computeSyntheticNodeEmbedding(existing.label, existing.summary)),
      created_at: now,
    });
    const newNode = existingNode("new-1", existing.label, existing.summary);
    const plan: NodeChangePlan = {
      newNodes: [newNode],
      sightings: [
        {
          id: "s1",
          node_id: "new-1",
          conversation_id: "conv-1",
          message_id: "msg-1",
          created_at: now,
          origin_node_id: null,
        },
      ],
    };
    const fetchImpl = (async () =>
      Response.json({
        choices: [
          {
            message: { content: JSON.stringify({ verdicts: [{ pairId: "p0", verdict: "不同" }] }) },
          },
        ],
        usage: { prompt_tokens: 3, completion_tokens: 2 },
      })) as typeof fetch;
    const failures: PipelineFailure[] = [];
    const result = await runSynonymGateStage(
      baseInput(fetchImpl, () => undefined),
      plan,
      [existing],
      failures,
    );
    expect(result.newNodes).toEqual(plan.newNodes);
    expect(result.sightings).toEqual(plan.sightings);
    expect(result.aliasesToInsert).toEqual([]);
    expect(failures).toEqual([]);
  });

  it("degrades to the pre-gate plan and records one failure when the LLM call throws", async () => {
    temp = await setupBase();
    const existing = existingNode("existing-1", "if语句为什么要缩进", "缩进决定代码块归属");
    await temp.repos.knowledgeNodes.insert(existing);
    await temp.repos.nodeEmbeddings.upsert({
      node_id: existing.id,
      model: SYNTHETIC_EMBEDDING_MODEL,
      vector_json: JSON.stringify(computeSyntheticNodeEmbedding(existing.label, existing.summary)),
      created_at: now,
    });
    const newNode = existingNode("new-1", existing.label, existing.summary);
    const plan: NodeChangePlan = {
      newNodes: [newNode],
      sightings: [
        {
          id: "s1",
          node_id: "new-1",
          conversation_id: "conv-1",
          message_id: "msg-1",
          created_at: now,
          origin_node_id: null,
        },
      ],
    };
    const fetchImpl = (async () => {
      throw new Error("network blip");
    }) as typeof fetch;
    const failures: PipelineFailure[] = [];
    const result = await runSynonymGateStage(
      baseInput(fetchImpl, () => undefined),
      plan,
      [existing],
      failures,
    );
    expect(result).toEqual({ ...plan, aliasesToInsert: [] });
    expect(failures).toEqual([{ purpose: "knowledge-tree", error: expect.any(String) }]);
  });
});
