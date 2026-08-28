/**
 * Purpose: unit tests for the node-dedup synonym gate — candidate ranking by embedding
 * cosine similarity, prompt construction, and plan adjustment for the same/different verdicts.
 */
import type { KnowledgeNodeRow, NodeEmbeddingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import type { NodeChangePlan } from "./attach";
import {
  buildSynonymJudgeMessages,
  findSynonymCandidates,
  planSynonymGateResult,
  SYNONYM_CANDIDATE_TOP_K,
  type SynonymJudgeResult,
} from "./synonymGate";

function embeddingRow(nodeId: string, vector: number[]): NodeEmbeddingRow {
  return { node_id: nodeId, model: "test", vector_json: JSON.stringify(vector), created_at: "t" };
}

const DIMENSIONS = 8;

/**
 * A vector inside the narrow high-cosine band the real local e5 model produces (every pair of
 * live nodes measured between 0.802 and 0.949 on 2026-08-28): a shared centroid plus a small
 * lean along one axis. Two vectors leaning along the SAME axis are the genuine near-duplicates;
 * different axes still land around 0.82-0.85. Orthogonal `[1,0]`/`[0,1]` fixtures are
 * deliberately not used here — they are what made an absolute 0.85 threshold look correct for
 * months while it passed 100% of real nodes.
 */
function packedVector(axis: number, lean: number): number[] {
  const base = 1 / Math.sqrt(DIMENSIONS);
  const vector = new Array<number>(DIMENSIONS).fill(base);
  vector[axis % DIMENSIONS] = base + lean;
  return vector;
}

describe("findSynonymCandidates", () => {
  it("keeps the standout match and drops the rest of the packed band", () => {
    const candidates = findSynonymCandidates(new Map([["new-1", packedVector(0, 0.5)]]), [
      embeddingRow("existing-close", packedVector(0, 0.62)),
      ...Array.from({ length: 6 }, (_unused, index) =>
        embeddingRow(`existing-far-${index}`, packedVector(index + 1, 0.5 + index * 0.02)),
      ),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.existingNodeId).toBe("existing-close");
    // Proof the gate is what did the filtering: the rejected ones were NOT below 0.72, and
    // several were above 0.8 — an absolute floor would have kept every single one.
    expect(candidates[0]?.similarity ?? 0).toBeGreaterThan(0.95);
  });

  it("returns at most SYNONYM_CANDIDATE_TOP_K matches per new node", () => {
    const candidates = findSynonymCandidates(
      new Map([["new-1", packedVector(0, 0.5)]]),
      Array.from({ length: 6 }, (_unused, index) =>
        embeddingRow(`existing-${index}`, packedVector(0, 0.52 + index * 0.01)),
      ),
    );
    expect(candidates.length).toBeLessThanOrEqual(SYNONYM_CANDIDATE_TOP_K);
    expect(candidates.every((candidate) => candidate.newNodeId === "new-1")).toBe(true);
  });

  it("returns nothing when there are no existing embeddings", () => {
    expect(findSynonymCandidates(new Map([["new-1", packedVector(0, 0.5)]]), [])).toEqual([]);
  });

  it("keeps a lone existing node as a candidate — one point has no landscape to be an outlier in", () => {
    const candidates = findSynonymCandidates(new Map([["new-1", packedVector(0, 0.5)]]), [
      embeddingRow("existing-1", packedVector(3, 0.5)),
    ]);
    expect(candidates).toHaveLength(1);
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
  it("same verdict: drops the new node, redirects the sighting, and writes an alias", () => {
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
    const judged: SynonymJudgeResult = { verdicts: [{ pairId: "p0", verdict: "same" }] };
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

  it("different verdict: leaves the original plan untouched, no alias written", () => {
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
    const judged: SynonymJudgeResult = { verdicts: [{ pairId: "p0", verdict: "different" }] };
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
        { pairId: "p0", verdict: "same" },
        { pairId: "p1", verdict: "same" },
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
    const judged: SynonymJudgeResult = { verdicts: [{ pairId: "missing", verdict: "same" }] };
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
