/**
 * Purpose: unit tests for the open-learner-model evidence builder — filters encounters and
 * claims to the requested node, resolves conversation titles, keeps chronological order,
 * and passes through a null retention untouched.
 */
import type { MasteryClaimRow, NodeSightingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { buildNodeEvidence } from "./evidence";

function sighting(nodeId: string, conversationId: string, createdAt: string): NodeSightingRow {
  return {
    id: `s-${nodeId}-${createdAt}`,
    node_id: nodeId,
    conversation_id: conversationId,
    message_id: null,
    created_at: createdAt,
    origin_node_id: null,
  };
}

function claim(
  nodeId: string,
  level: MasteryClaimRow["level"],
  createdAt: string,
): MasteryClaimRow {
  return {
    id: `c-${nodeId}-${createdAt}`,
    node_id: nodeId,
    level,
    source: "self-report",
    created_at: createdAt,
  };
}

describe("buildNodeEvidence", () => {
  it("returns empty evidence with the retention passed through when nothing matches", () => {
    const evidence = buildNodeEvidence("n1", {
      sightings: [],
      conversationTitlesById: new Map(),
      retention: null,
      masteryClaims: [],
    });
    expect(evidence).toEqual({ nodeId: "n1", encounters: [], retention: null, claims: [] });
  });

  it("filters to the requested node and resolves conversation titles", () => {
    const evidence = buildNodeEvidence("n1", {
      sightings: [
        sighting("n1", "conv-a", "2026-08-01T00:00:00.000Z"),
        sighting("n2", "conv-b", "2026-08-02T00:00:00.000Z"),
      ],
      conversationTitlesById: new Map([["conv-a", "闭包入门"]]),
      retention: 0.8,
      masteryClaims: [],
    });
    expect(evidence.encounters).toEqual([
      { occurredAtIso: "2026-08-01T00:00:00.000Z", conversationTitle: "闭包入门" },
    ]);
    expect(evidence.retention).toBe(0.8);
  });

  it("falls back to the conversation id when no title is known", () => {
    const evidence = buildNodeEvidence("n1", {
      sightings: [sighting("n1", "conv-unknown", "2026-08-01T00:00:00.000Z")],
      conversationTitlesById: new Map(),
      retention: 0.5,
      masteryClaims: [],
    });
    expect(evidence.encounters[0]?.conversationTitle).toBe("conv-unknown");
  });

  it("orders encounters and claims chronologically, oldest first", () => {
    const evidence = buildNodeEvidence("n1", {
      sightings: [
        sighting("n1", "c1", "2026-08-05T00:00:00.000Z"),
        sighting("n1", "c1", "2026-08-01T00:00:00.000Z"),
      ],
      conversationTitlesById: new Map([["c1", "对话"]]),
      retention: 0.5,
      masteryClaims: [
        claim("n1", "learned", "2026-08-04T00:00:00.000Z"),
        claim("n1", "familiar", "2026-08-02T00:00:00.000Z"),
      ],
    });
    expect(evidence.encounters.map((e) => e.occurredAtIso)).toEqual([
      "2026-08-01T00:00:00.000Z",
      "2026-08-05T00:00:00.000Z",
    ]);
    expect(evidence.claims.map((c) => c.level)).toEqual(["familiar", "learned"]);
  });
});
