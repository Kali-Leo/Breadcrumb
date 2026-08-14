/**
 * Purpose: unit tests for the node-dedup synonym gate — candidate ranking by embedding
 * cosine similarity, prompt construction, and plan adjustment for the "同一"/"不同" verdicts.
 */
import type { KnowledgeNodeRow, NodeEmbeddingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import type { NodeChangePlan } from "./attach";
import {
  buildSynonymJudgeMessages,
  findSynonymCandidates,
  planSynonymGateResult,
  SYNONYM_SIMILARITY_THRESHOLD,
  type SynonymJudgeResult,
} from "./synonymGate";

function embeddingRow(nodeId: string, vector: number[]): NodeEmbeddingRow {
  return { node_id: nodeId, model: "test", vector_json: JSON.stringify(vector), created_at: "t" };
}

describe("findSynonymCandidates", () => {
  it("returns the single best match at/above the threshold", () => {
    const candidates = findSynonymCandidates(
      new Map([["new-1", [1, 0]]]),
      [embeddingRow("existing-close", [1, 0]), embeddingRow("existing-far", [0, 1])],
      SYNONYM_SIMILARITY_THRESHOLD,
    );
    expect(candidates).toEqual([
      { newNodeId: "new-1", existingNodeId: "existing-close", similarity: 1 },
    ]);
  });

  it("returns nothing when the best match is below the threshold", () => {
    const candidates = findSynonymCandidates(
      new Map([["new-1", [1, 0]]]),
      [embeddingRow("existing-1", [0, 1])],
      SYNONYM_SIMILARITY_THRESHOLD,
    );
    expect(candidates).toEqual([]);
  });

  it("returns nothing when there are no existing embeddings", () => {
    const candidates = findSynonymCandidates(
      new Map([["new-1", [1, 0]]]),
      [],
      SYNONYM_SIMILARITY_THRESHOLD,
    );
    expect(candidates).toEqual([]);
  });
});

describe("buildSynonymJudgeMessages", () => {
  it("lists every pair with its new/existing label and summary", () => {
    const messages = buildSynonymJudgeMessages([
      {
        pairId: "p0",
        newLabel: "if缩进",
        newSummary: "换了个说法",
        existingLabel: "if语句为什么要缩进",
        existingSummary: "原节点",
      },
    ]);
    expect(messages[1]?.content).toContain("if缩进");
    expect(messages[1]?.content).toContain("if语句为什么要缩进");
    expect(messages[1]?.content).toContain("[p0]");
  });
});

function newNode(id: string, label: string): KnowledgeNodeRow {
  return { id, parent_id: null, label, summary: "s", kind: "concept", created_at: "t" };
}

const planTestDefaults = {
  conversationId: "conv-1",
  sourceMessageId: "msg-1",
  newId: (() => {
    let counter = 0;
    return () => `alias-id-${++counter}`;
  })(),
  nowIso: () => "2026-08-03T10:00:00Z",
};

describe("planSynonymGateResult", () => {
  it("同一 verdict: drops the new node, redirects the sighting, and writes an alias", () => {
    const plan: NodeChangePlan = {
      newNodes: [newNode("new-1", "if缩进")],
      sightings: [
        {
          id: "s1",
          node_id: "new-1",
          conversation_id: "conv-1",
          message_id: "msg-1",
          created_at: "t",
          origin_node_id: null,
        },
      ],
    };
    const judged: SynonymJudgeResult = { verdicts: [{ pairId: "p0", verdict: "同一" }] };
    const result = planSynonymGateResult({
      plan,
      pairs: [{ pairId: "p0", newNodeId: "new-1", existingNodeId: "existing-1" }],
      judged,
      ...planTestDefaults,
    });
    expect(result.newNodes).toHaveLength(0);
    expect(result.sightings).toEqual([
      {
        id: "alias-id-1",
        node_id: "existing-1",
        conversation_id: "conv-1",
        message_id: "msg-1",
        created_at: "2026-08-03T10:00:00Z",
        origin_node_id: null,
      },
    ]);
    expect(result.aliasesToInsert).toEqual([
      { alias_label: "if缩进", node_id: "existing-1", created_at: "2026-08-03T10:00:00Z" },
    ]);
  });

  it("不同 verdict: leaves the original plan untouched, no alias written", () => {
    const plan: NodeChangePlan = {
      newNodes: [newNode("new-1", "if冒号必须")],
      sightings: [
        {
          id: "s1",
          node_id: "new-1",
          conversation_id: "conv-1",
          message_id: "msg-1",
          created_at: "t",
          origin_node_id: null,
        },
      ],
    };
    const judged: SynonymJudgeResult = { verdicts: [{ pairId: "p0", verdict: "不同" }] };
    const result = planSynonymGateResult({
      plan,
      pairs: [{ pairId: "p0", newNodeId: "new-1", existingNodeId: "existing-1" }],
      judged,
      ...planTestDefaults,
    });
    expect(result.newNodes).toEqual(plan.newNodes);
    expect(result.sightings).toEqual(plan.sightings);
    expect(result.aliasesToInsert).toEqual([]);
  });

  it("does not add a second sighting when two dropped nodes redirect to the same existing node", () => {
    const plan: NodeChangePlan = {
      newNodes: [newNode("new-1", "if缩进"), newNode("new-2", "缩进规则")],
      sightings: [
        {
          id: "s1",
          node_id: "new-1",
          conversation_id: "conv-1",
          message_id: "msg-1",
          created_at: "t",
          origin_node_id: null,
        },
        {
          id: "s2",
          node_id: "new-2",
          conversation_id: "conv-1",
          message_id: "msg-1",
          created_at: "t",
          origin_node_id: null,
        },
      ],
    };
    const judged: SynonymJudgeResult = {
      verdicts: [
        { pairId: "p0", verdict: "同一" },
        { pairId: "p1", verdict: "同一" },
      ],
    };
    const result = planSynonymGateResult({
      plan,
      pairs: [
        { pairId: "p0", newNodeId: "new-1", existingNodeId: "existing-1" },
        { pairId: "p1", newNodeId: "new-2", existingNodeId: "existing-1" },
      ],
      judged,
      ...planTestDefaults,
    });
    expect(result.newNodes).toHaveLength(0);
    expect(result.sightings).toHaveLength(1);
    expect(result.aliasesToInsert).toHaveLength(2);
  });

  it("ignores a verdict whose pairId is unknown", () => {
    const plan: NodeChangePlan = {
      newNodes: [newNode("new-1", "if缩进")],
      sightings: [],
    };
    const judged: SynonymJudgeResult = { verdicts: [{ pairId: "missing", verdict: "同一" }] };
    const result = planSynonymGateResult({ plan, pairs: [], judged, ...planTestDefaults });
    expect(result.newNodes).toEqual(plan.newNodes);
    expect(result.aliasesToInsert).toEqual([]);
  });

  it("returns an equivalent plan for an empty verdicts array", () => {
    const plan: NodeChangePlan = { newNodes: [newNode("new-1", "闭包")], sightings: [] };
    const result = planSynonymGateResult({
      plan,
      pairs: [],
      judged: { verdicts: [] },
      ...planTestDefaults,
    });
    expect(result).toEqual({
      newNodes: plan.newNodes,
      sightings: plan.sightings,
      aliasesToInsert: [],
    });
  });
});
