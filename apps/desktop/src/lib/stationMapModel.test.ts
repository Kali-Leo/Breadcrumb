/**
 * Purpose: unit tests for buildStationMapModel — linear/branching trees, stationless-branch
 * dropping, cross-line dedup, frontier truncation, staleness, the empty-input edge case, and
 * spec 040 §7's provenance-tree parentage (delegated to stationMapProvenance.ts, covered in
 * its own test file for the rule-by-rule detail).
 */
import type { KnowledgeEdgeRow, MessageRow, NodeSightingRow } from "@breadcrumb/core-db";
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
      edges: [],
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

  it("degenerates to a flat trunk with no edges and no origin (spec 040 §7 fallback)", () => {
    const model = buildStationMapModel({
      rows,
      currentLeafId: null,
      sightings,
      edges: [],
      labelsByNode,
      retentionByNode: new Map(),
      frontier: [],
    });
    expect(model.mainLine.map((s) => s.parentNodeId)).toEqual([null, null]);
    expect(model.mainLine.map((s) => s.depth)).toEqual([0, 0]);
    expect(model.mainLine.map((s) => s.order)).toEqual([1, 2]);
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
      edges: [],
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

  it("a branch station keeps the flat spec 040 §3 shape (never parent-resolved)", () => {
    const model = buildStationMapModel({
      rows,
      currentLeafId: null,
      sightings,
      // An edge between the branch station and the main line exists, but branches are never
      // parent-resolved — only the main line is (spec 040 §7 scope).
      edges: [edge("a", "c")],
      labelsByNode,
      retentionByNode: new Map(),
      frontier: [],
    });
    expect(model.branches[0]?.stations[0]?.parentNodeId).toBeNull();
    expect(model.branches[0]?.stations[0]?.depth).toBe(0);
  });

  it("a stationless branch is dropped entirely", () => {
    const model = buildStationMapModel({
      rows,
      currentLeafId: null,
      sightings: sightings.filter((s) => s.node_id !== "c"), // branch m3 gets no sighting
      edges: [],
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
      edges: [],
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
      edges: [],
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
      edges: [],
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
      edges: [],
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
      edges: [],
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

describe("buildStationMapModel — transfer (spec 041 §3)", () => {
  const rows = [row("m1", "2026-08-14T10:00:00Z", null)];
  const sightings = [
    sighting("s1", "a", "m1", "2026-08-14T10:00:01Z"),
    sighting("s2", "b", "m1", "2026-08-14T10:00:02Z"),
  ];

  it("marks only the station whose node appears in another conversation", () => {
    const model = buildStationMapModel({
      rows,
      currentLeafId: null,
      sightings,
      edges: [],
      labelsByNode,
      retentionByNode: new Map(),
      frontier: [],
      nodeIdsInOtherTrails: new Set(["a"]),
    });
    expect(model.mainLine.find((s) => s.nodeId === "a")?.transfer).toBe(true);
    expect(model.mainLine.find((s) => s.nodeId === "b")?.transfer).toBe(false);
  });

  it("defaults to no transfers when the set is omitted", () => {
    const model = buildStationMapModel({
      rows,
      currentLeafId: null,
      sightings,
      edges: [],
      labelsByNode,
      retentionByNode: new Map(),
      frontier: [],
    });
    expect(model.mainLine.every((s) => !s.transfer)).toBe(true);
  });
});

describe("buildStationMapModel — provenance parentage (spec 040 §7)", () => {
  // Four stations on one message, first-touched in order a, b, c, d.
  const rows = [row("m1", "2026-08-14T10:00:00Z", null)];

  it("rule ① origin wins over an available edge to a nearer station", () => {
    const sightings = [
      sighting("s1", "a", "m1", "2026-08-14T10:00:01Z"),
      sighting("s2", "b", "m1", "2026-08-14T10:00:02Z"),
      sighting("s3", "c", "m1", "2026-08-14T10:00:03Z", "a"), // origin a, not adjacent b
    ];
    const model = buildStationMapModel({
      rows,
      currentLeafId: null,
      sightings,
      edges: [edge("b", "c")], // would win rule ② if origin didn't take priority
      labelsByNode,
      retentionByNode: new Map(),
      frontier: [],
    });
    expect(model.mainLine.find((s) => s.nodeId === "c")?.parentNodeId).toBe("a");
  });

  it("rule ② falls back to an edge with the immediately preceding station", () => {
    const sightings = [
      sighting("s1", "a", "m1", "2026-08-14T10:00:01Z"),
      sighting("s2", "b", "m1", "2026-08-14T10:00:02Z"),
      sighting("s3", "c", "m1", "2026-08-14T10:00:03Z"), // no origin
    ];
    const model = buildStationMapModel({
      rows,
      currentLeafId: null,
      sightings,
      edges: [edge("c", "b")], // reverse direction still counts
      labelsByNode,
      retentionByNode: new Map(),
      frontier: [],
    });
    expect(model.mainLine.find((s) => s.nodeId === "c")?.parentNodeId).toBe("b");
  });

  it("rule ③ falls back to the nearest earlier station with an edge, when the immediate predecessor has none", () => {
    const sightings = [
      sighting("s1", "a", "m1", "2026-08-14T10:00:01Z"),
      sighting("s2", "b", "m1", "2026-08-14T10:00:02Z"),
      sighting("s3", "c", "m1", "2026-08-14T10:00:03Z"), // no origin, no edge to b
      sighting("s4", "d", "m1", "2026-08-14T10:00:04Z"), // no origin, edges to both a and b
    ];
    const model = buildStationMapModel({
      rows,
      currentLeafId: null,
      sightings,
      edges: [edge("a", "c"), edge("a", "d"), edge("b", "d")],
      labelsByNode,
      retentionByNode: new Map(),
      frontier: [],
    });
    expect(model.mainLine.find((s) => s.nodeId === "c")?.parentNodeId).toBe("a");
    // d has an edge to both a (order 1) and b (order 2) — nearest (highest order) wins.
    expect(model.mainLine.find((s) => s.nodeId === "d")?.parentNodeId).toBe("b");
  });

  it("rule ④ new trunk root when nothing matches", () => {
    const sightings = [
      sighting("s1", "a", "m1", "2026-08-14T10:00:01Z"),
      sighting("s2", "b", "m1", "2026-08-14T10:00:02Z"),
    ];
    const model = buildStationMapModel({
      rows,
      currentLeafId: null,
      sightings,
      edges: [],
      labelsByNode,
      retentionByNode: new Map(),
      frontier: [],
    });
    expect(model.mainLine.find((s) => s.nodeId === "b")?.parentNodeId).toBeNull();
    expect(model.mainLine.find((s) => s.nodeId === "b")?.depth).toBe(0);
  });

  it("depth is the parent chain length, growing one level per origin hop", () => {
    const sightings = [
      sighting("s1", "a", "m1", "2026-08-14T10:00:01Z"),
      sighting("s2", "b", "m1", "2026-08-14T10:00:02Z", "a"),
      sighting("s3", "c", "m1", "2026-08-14T10:00:03Z", "b"),
    ];
    const model = buildStationMapModel({
      rows,
      currentLeafId: null,
      sightings,
      edges: [],
      labelsByNode,
      retentionByNode: new Map(),
      frontier: [],
    });
    expect(model.mainLine.map((s) => s.depth)).toEqual([0, 1, 2]);
  });

  it("cycle safety: an origin pointing at a later station is ignored, never producing a forward parent", () => {
    // a's origin points at b, which is only touched afterward — a cannot adopt a not-yet-seen
    // parent, so it falls through rules ②③④ same as if it had no origin at all.
    const sightings = [
      sighting("s1", "a", "m1", "2026-08-14T10:00:01Z", "b"),
      sighting("s2", "b", "m1", "2026-08-14T10:00:02Z"),
    ];
    const model = buildStationMapModel({
      rows,
      currentLeafId: null,
      sightings,
      edges: [],
      labelsByNode,
      retentionByNode: new Map(),
      frontier: [],
    });
    expect(model.mainLine.find((s) => s.nodeId === "a")?.parentNodeId).toBeNull();
    expect(model.mainLine.find((s) => s.nodeId === "a")?.depth).toBe(0);
  });
});

describe("buildStationMapModel — empty input", () => {
  it("returns an empty model with no current message", () => {
    const model = buildStationMapModel({
      rows: [],
      currentLeafId: null,
      sightings: [],
      edges: [],
      labelsByNode: new Map(),
      retentionByNode: new Map(),
      frontier: [],
    });
    expect(model).toEqual({ mainLine: [], branches: [], frontier: [], currentMessageId: null });
  });
});
