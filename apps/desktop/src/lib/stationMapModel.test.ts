/**
 * Purpose: unit tests for buildStationMapModel — linear/branching trees, stationless-branch
 * dropping, cross-line dedup, frontier truncation, staleness, and the empty-input edge case.
 */
import type { MessageRow, NodeSightingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { buildStationMapModel } from "./stationMapModel";

function row(id: string, createdAt: string, parentId: string | null): MessageRow {
  return {
    id,
    conversation_id: "c1",
    role: id.startsWith("u") ? "user" : "assistant",
    content: id,
    created_at: createdAt,
    teaching_mode: null,
    parent_id: parentId,
  };
}

function sighting(
  id: string,
  nodeId: string,
  messageId: string | null,
  createdAt: string,
): NodeSightingRow {
  return {
    id,
    node_id: nodeId,
    conversation_id: "c1",
    message_id: messageId,
    created_at: createdAt,
  };
}

const labelsByNode = new Map([
  ["a", "闭包"],
  ["b", "作用域"],
  ["c", "原型链"],
  ["d", "事件循环"],
]);

describe("buildStationMapModel — linear, no branches", () => {
  const rows = [
    row("m1", "2026-08-14T10:00:00Z", null),
    row("m2", "2026-08-14T10:01:00Z", "m1"),
    row("m3", "2026-08-14T10:02:00Z", "m2"),
  ];
  const sightings = [
    sighting("s1", "a", "m1", "2026-08-14T10:00:01Z"),
    sighting("s2", "b", "m3", "2026-08-14T10:02:01Z"),
  ];

  it("puts every station on the main line, in path order", () => {
    const model = buildStationMapModel({
      rows,
      currentLeafId: null,
      sightings,
      labelsByNode,
      retentionByNode: new Map(),
      frontier: [],
    });
    expect(model.mainLine.map((s) => s.nodeId)).toEqual(["a", "b"]);
    expect(model.mainLine.map((s) => s.index)).toEqual([0, 1]);
    expect(model.mainLine.every((s) => s.onActivePath)).toBe(true);
    expect(model.branches).toEqual([]);
    expect(model.currentMessageId).toBe("m3");
  });
});

describe("buildStationMapModel — with a branch", () => {
  // m1 -> m2 -> m4 (active, newest) ; m2 -> m3 (branch, older leaf)
  const rows = [
    row("m1", "2026-08-14T10:00:00Z", null),
    row("m2", "2026-08-14T10:01:00Z", "m1"),
    row("m3", "2026-08-14T10:02:00Z", "m2"),
    row("m4", "2026-08-14T10:03:00Z", "m2"),
  ];
  const sightings = [
    sighting("s1", "a", "m1", "2026-08-14T10:00:01Z"),
    sighting("s2", "b", "m4", "2026-08-14T10:03:01Z"),
    sighting("s3", "c", "m3", "2026-08-14T10:02:01Z"),
  ];

  it("main line follows the newest leaf; the other fork becomes a branch stub", () => {
    const model = buildStationMapModel({
      rows,
      currentLeafId: null,
      sightings,
      labelsByNode,
      retentionByNode: new Map(),
      frontier: [],
    });
    expect(model.mainLine.map((s) => s.nodeId)).toEqual(["a", "b"]);
    expect(model.branches).toHaveLength(1);
    expect(model.branches[0]?.forkMessageId).toBe("m2");
    expect(model.branches[0]?.leafId).toBe("m3");
    expect(model.branches[0]?.stations.map((s) => s.nodeId)).toEqual(["c"]);
    expect(model.branches[0]?.stations[0]?.onActivePath).toBe(false);
  });

  it("a stationless branch is dropped entirely", () => {
    const model = buildStationMapModel({
      rows,
      currentLeafId: null,
      sightings: sightings.filter((s) => s.node_id !== "c"), // branch m3 gets no sighting
      labelsByNode,
      retentionByNode: new Map(),
      frontier: [],
    });
    expect(model.branches).toEqual([]);
  });

  it("a node already on the main line is not repeated on a branch (global dedup)", () => {
    const model = buildStationMapModel({
      rows,
      currentLeafId: null,
      sightings: [...sightings, sighting("s4", "a", "m3", "2026-08-14T10:02:02Z")],
      labelsByNode,
      retentionByNode: new Map(),
      frontier: [],
    });
    // branch m3 sees both "a" (already used by main line) and "c" — only "c" stations
    expect(model.branches[0]?.stations.map((s) => s.nodeId)).toEqual(["c"]);
  });
});

describe("buildStationMapModel — dedup within one line", () => {
  const rows = [row("m1", "2026-08-14T10:00:00Z", null), row("m2", "2026-08-14T10:01:00Z", "m1")];
  const sightings = [
    sighting("s1", "a", "m1", "2026-08-14T10:00:01Z"),
    sighting("s2", "a", "m2", "2026-08-14T10:01:01Z"), // re-sighted, not a new station
  ];

  it("keeps only the first touch of a node", () => {
    const model = buildStationMapModel({
      rows,
      currentLeafId: null,
      sightings,
      labelsByNode,
      retentionByNode: new Map(),
      frontier: [],
    });
    expect(model.mainLine.map((s) => s.nodeId)).toEqual(["a"]);
    expect(model.mainLine[0]?.messageId).toBe("m1");
  });
});

describe("buildStationMapModel — staleness", () => {
  const rows = [row("m1", "2026-08-14T10:00:00Z", null)];
  const sightings = [
    sighting("s1", "a", "m1", "2026-08-14T10:00:01Z"),
    sighting("s2", "b", "m1", "2026-08-14T10:00:02Z"),
  ];

  it("marks a station stale below threshold, and a never-tracked node as fresh", () => {
    const model = buildStationMapModel({
      rows,
      currentLeafId: null,
      sightings,
      labelsByNode,
      retentionByNode: new Map([["a", 0.2]]),
      frontier: [],
    });
    expect(model.mainLine.find((s) => s.nodeId === "a")?.stale).toBe(true);
    expect(model.mainLine.find((s) => s.nodeId === "b")?.stale).toBe(false);
  });

  it("respects a custom threshold", () => {
    const model = buildStationMapModel({
      rows,
      currentLeafId: null,
      sightings,
      labelsByNode,
      retentionByNode: new Map([["a", 0.7]]),
      frontier: [],
      staleThreshold: 0.9,
    });
    expect(model.mainLine.find((s) => s.nodeId === "a")?.stale).toBe(true);
  });
});

describe("buildStationMapModel — frontier", () => {
  const rows = [row("m1", "2026-08-14T10:00:00Z", null)];

  it("caps the frontier at 3 and resolves viaLabel with a nodeId fallback", () => {
    const model = buildStationMapModel({
      rows,
      currentLeafId: null,
      sightings: [],
      labelsByNode,
      retentionByNode: new Map(),
      frontier: [
        { nodeId: "b", label: "作用域", viaNodeId: "a" },
        { nodeId: "c", label: "原型链", viaNodeId: "a" },
        { nodeId: "d", label: "事件循环", viaNodeId: "a" },
        { nodeId: "e", label: "闭包陷阱", viaNodeId: "unknown-node" },
      ],
    });
    expect(model.frontier).toHaveLength(3);
    expect(model.frontier[0]).toEqual({ nodeId: "b", label: "作用域", viaLabel: "闭包" });
  });
});

describe("buildStationMapModel — empty input", () => {
  it("returns an empty model with no current message", () => {
    const model = buildStationMapModel({
      rows: [],
      currentLeafId: null,
      sightings: [],
      labelsByNode: new Map(),
      retentionByNode: new Map(),
      frontier: [],
    });
    expect(model).toEqual({ mainLine: [], branches: [], frontier: [], currentMessageId: null });
  });
});
