/**
 * Purpose: direct unit tests for stationMapProvenance.ts's two building blocks — first-touch
 * station drafting (dedup, ordering) and the spec 040 §7 parent-resolution rule ladder,
 * exercised on StationDraft fixtures rather than through the full buildStationMapModel input.
 */
import type { KnowledgeEdgeRow, NodeSightingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import type { Station } from "./stationMapModel";
import {
  buildStationDrafts,
  resolveMainLineParentage,
  type StationDraft,
} from "./stationMapProvenance";

function sighting(
  id: string,
  nodeId: string,
  messageId: string,
  createdAt: string,
  originNodeId: string | null = null,
): NodeSightingRow {
  return {
    id,
    node_id: nodeId,
    conversation_id: "c1",
    message_id: messageId,
    created_at: createdAt,
    origin_node_id: originNodeId,
  };
}

function edge(sourceId: string, targetId: string): KnowledgeEdgeRow {
  return {
    id: `e-${sourceId}-${targetId}`,
    source_id: sourceId,
    target_id: targetId,
    edge_type: "requires",
    weight: 1,
    confidence: 1,
    origin: "llm",
    created_at: "2026-08-14T00:00:00Z",
  };
}

function draft(nodeId: string, originNodeId: string | null): StationDraft {
  const station: Station = {
    nodeId,
    label: nodeId,
    messageId: "m1",
    index: 0,
    onActivePath: true,
    stale: false,
    transfer: false,
    parentNodeId: null,
    depth: 0,
    order: 0,
  };
  return { station, originNodeId };
}

describe("buildStationDrafts", () => {
  it("dedups a re-sighted node to its first touch and numbers order from 1", () => {
    const drafts = buildStationDrafts(
      ["m1", "m2"],
      [
        sighting("s1", "a", "m1", "t1"),
        sighting("s2", "a", "m2", "t2"), // re-sighted, not a new draft
        sighting("s3", "b", "m2", "t3"),
      ],
      new Set(),
      new Map(),
      new Map(),
      0.6,
      true,
      new Set(),
    );
    expect(drafts.map((d) => d.station.nodeId)).toEqual(["a", "b"]);
    expect(drafts.map((d) => d.station.order)).toEqual([1, 2]);
  });

  it("carries the sighting's origin_node_id through untouched", () => {
    const drafts = buildStationDrafts(
      ["m1"],
      [sighting("s1", "a", "m1", "t1", "origin-x")],
      new Set(),
      new Map(),
      new Map(),
      0.6,
      true,
      new Set(),
    );
    expect(drafts[0]?.originNodeId).toBe("origin-x");
  });
});

describe("resolveMainLineParentage", () => {
  it("rule ①: an origin naming an earlier station wins", () => {
    const drafts = [draft("a", null), draft("b", null), draft("c", "a")];
    resolveMainLineParentage(drafts, [edge("b", "c")]);
    expect(drafts[2]?.station.parentNodeId).toBe("a");
  });

  it("rule ②: an edge to the immediate predecessor, when there's no usable origin", () => {
    const drafts = [draft("a", null), draft("b", null), draft("c", null)];
    resolveMainLineParentage(drafts, [edge("c", "b")]);
    expect(drafts[2]?.station.parentNodeId).toBe("b");
  });

  it("rule ③: the nearest earlier station with an edge, when the predecessor has none", () => {
    const drafts = [draft("a", null), draft("b", null), draft("c", null)];
    resolveMainLineParentage(drafts, [edge("a", "c")]);
    expect(drafts[2]?.station.parentNodeId).toBe("a");
  });

  it("rule ④: null when no origin and no edge apply", () => {
    const drafts = [draft("a", null), draft("b", null)];
    resolveMainLineParentage(drafts, []);
    expect(drafts[1]?.station.parentNodeId).toBeNull();
    expect(drafts[1]?.station.depth).toBe(0);
  });

  it("depth chains through resolved parents", () => {
    const drafts = [draft("a", null), draft("b", "a"), draft("c", "b")];
    resolveMainLineParentage(drafts, []);
    expect(drafts.map((d) => d.station.depth)).toEqual([0, 1, 2]);
  });

  it("cycle safety: an origin naming a not-yet-seen (later) station is ignored", () => {
    const drafts = [draft("a", "b"), draft("b", null)];
    resolveMainLineParentage(drafts, []);
    expect(drafts[0]?.station.parentNodeId).toBeNull();
  });
});
