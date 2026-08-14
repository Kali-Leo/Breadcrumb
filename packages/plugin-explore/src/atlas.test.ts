/**
 * Purpose: tests for the six-layer exploration atlas — trail order, backfill/revisit detours,
 * unused links, frontier direction semantics, staleness, and empty-session/no-edge boundaries
 * (spec 039 acceptance 7).
 */

import type { KnowledgeEdgeRow, NodeSightingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { type AtlasInput, buildExplorationAtlas, STALE_RETENTION_THRESHOLD } from "./atlas";

function sighting(nodeId: string, secondsOffset: number): NodeSightingRow {
  return {
    id: `s-${nodeId}-${secondsOffset}`,
    node_id: nodeId,
    conversation_id: "c1",
    message_id: null,
    created_at: new Date(2026, 0, 1, 0, 0, secondsOffset).toISOString(),
  };
}

function edge(
  id: string,
  sourceId: string,
  targetId: string,
  edgeType: "requires" | "helps" = "requires",
): KnowledgeEdgeRow {
  return {
    id,
    source_id: sourceId,
    target_id: targetId,
    edge_type: edgeType,
    weight: 1,
    confidence: 1,
    origin: "llm",
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

const LABELS = new Map([
  ["A", "光合作用"],
  ["B", "光反应"],
  ["C", "暗反应"],
  ["D", "叶绿体"],
]);

function baseInput(overrides: Partial<AtlasInput>): AtlasInput {
  return {
    sightings: [],
    labelsByNode: LABELS,
    edges: [],
    retentionByNode: new Map(),
    ...overrides,
  };
}

describe("buildExplorationAtlas", () => {
  it("returns an all-empty atlas for an empty session", () => {
    const atlas = buildExplorationAtlas(baseInput({}));
    expect(atlas).toEqual({
      trail: [],
      structure: [],
      detours: [],
      unusedLinks: [],
      frontier: [],
      staleness: [],
    });
  });

  it("builds the trail in first-sighting order, deduplicated", () => {
    const atlas = buildExplorationAtlas(
      baseInput({ sightings: [sighting("A", 0), sighting("B", 1), sighting("A", 2)] }),
    );
    expect(atlas.trail).toEqual([
      { nodeId: "A", label: "光合作用" },
      { nodeId: "B", label: "光反应" },
    ]);
  });

  it("falls back to the node id as label when missing from the label map", () => {
    const atlas = buildExplorationAtlas(
      baseInput({ sightings: [sighting("Z", 0)], labelsByNode: new Map() }),
    );
    expect(atlas.trail).toEqual([{ nodeId: "Z", label: "Z" }]);
  });

  it("produces no structure or detours when the session has no edges", () => {
    const atlas = buildExplorationAtlas(
      baseInput({ sightings: [sighting("A", 0), sighting("B", 1)] }),
    );
    expect(atlas.structure).toEqual([]);
    expect(atlas.detours).toEqual([]);
    expect(atlas.unusedLinks).toEqual([]);
    expect(atlas.frontier).toEqual([]);
  });

  it("flags a backfill when the prerequisite is visited after its dependent", () => {
    // requires edge: A is B's prerequisite, but the trail visits B before A.
    const atlas = buildExplorationAtlas(
      baseInput({
        sightings: [sighting("B", 0), sighting("A", 1)],
        edges: [edge("e1", "A", "B", "requires")],
      }),
    );
    expect(atlas.detours).toEqual([{ kind: "backfill", nodeId: "A", relatedNodeId: "B" }]);
  });

  it("does not flag backfill when the prerequisite is visited first", () => {
    const atlas = buildExplorationAtlas(
      baseInput({
        sightings: [sighting("A", 0), sighting("B", 1)],
        edges: [edge("e1", "A", "B", "requires")],
      }),
    );
    expect(atlas.detours).toEqual([]);
  });

  it("does not treat a helps edge as backfillable", () => {
    const atlas = buildExplorationAtlas(
      baseInput({
        sightings: [sighting("B", 0), sighting("A", 1)],
        edges: [edge("e1", "A", "B", "helps")],
      }),
    );
    expect(atlas.detours).toEqual([]);
  });

  it("flags a revisit when a node is re-sighted after the trail moved on", () => {
    const atlas = buildExplorationAtlas(
      baseInput({ sightings: [sighting("A", 0), sighting("B", 1), sighting("A", 2)] }),
    );
    expect(atlas.detours).toEqual([{ kind: "revisit", nodeId: "A", relatedNodeId: null }]);
  });

  it("does not flag a revisit for consecutive re-sightings of the same node", () => {
    const atlas = buildExplorationAtlas(
      baseInput({ sightings: [sighting("A", 0), sighting("A", 1), sighting("B", 2)] }),
    );
    expect(atlas.detours).toEqual([]);
  });

  it("reports a revisit at most once per node even with multiple re-interruptions", () => {
    const atlas = buildExplorationAtlas(
      baseInput({
        sightings: [
          sighting("A", 0),
          sighting("B", 1),
          sighting("A", 2),
          sighting("C", 3),
          sighting("A", 4),
        ],
      }),
    );
    const revisits = atlas.detours.filter((detour) => detour.kind === "revisit");
    expect(revisits).toEqual([{ kind: "revisit", nodeId: "A", relatedNodeId: null }]);
  });

  it("lists an edge between two visited, non-adjacent nodes as an unused link", () => {
    const atlas = buildExplorationAtlas(
      baseInput({
        sightings: [sighting("A", 0), sighting("B", 1), sighting("C", 2)],
        edges: [edge("e1", "A", "C", "helps")],
      }),
    );
    expect(atlas.unusedLinks).toEqual([edge("e1", "A", "C", "helps")]);
  });

  it("does not list an edge between trail-adjacent visited nodes as unused", () => {
    const atlas = buildExplorationAtlas(
      baseInput({
        sightings: [sighting("A", 0), sighting("B", 1)],
        edges: [edge("e1", "A", "B", "helps")],
      }),
    );
    expect(atlas.unusedLinks).toEqual([]);
    expect(atlas.structure).toEqual([edge("e1", "A", "B", "helps")]);
  });

  it("puts the unvisited end of a requires edge in frontier with direction semantics", () => {
    // D (unvisited) is A's (visited) prerequisite: A requires D.
    const prerequisiteUnvisited = buildExplorationAtlas(
      baseInput({
        sightings: [sighting("A", 0)],
        edges: [edge("e1", "D", "A", "requires")],
      }),
    );
    expect(prerequisiteUnvisited.frontier).toEqual([
      {
        nodeId: "D",
        label: "叶绿体",
        viaNodeId: "A",
        edgeType: "requires",
        isPrerequisiteOfVisited: true,
      },
    ]);

    // A (visited) is D's (unvisited) prerequisite: D requires A.
    const dependentUnvisited = buildExplorationAtlas(
      baseInput({
        sightings: [sighting("A", 0)],
        edges: [edge("e1", "A", "D", "requires")],
      }),
    );
    expect(dependentUnvisited.frontier).toEqual([
      {
        nodeId: "D",
        label: "叶绿体",
        viaNodeId: "A",
        edgeType: "requires",
        isPrerequisiteOfVisited: false,
      },
    ]);
  });

  it("puts the unvisited end of a helps edge in frontier without prerequisite framing", () => {
    const atlas = buildExplorationAtlas(
      baseInput({
        sightings: [sighting("A", 0)],
        edges: [edge("e1", "A", "D", "helps")],
      }),
    );
    expect(atlas.frontier).toEqual([
      {
        nodeId: "D",
        label: "叶绿体",
        viaNodeId: "A",
        edgeType: "helps",
        isPrerequisiteOfVisited: false,
      },
    ]);
  });

  it("excludes edges where both ends are visited or both are unvisited from frontier", () => {
    const atlas = buildExplorationAtlas(
      baseInput({
        sightings: [sighting("A", 0), sighting("B", 1)],
        edges: [edge("e1", "A", "B", "helps"), edge("e2", "C", "D", "helps")],
      }),
    );
    expect(atlas.frontier).toEqual([]);
  });

  it("flags visited nodes below the staleness threshold and excludes those at or above it", () => {
    const atlas = buildExplorationAtlas(
      baseInput({
        sightings: [sighting("A", 0), sighting("B", 1), sighting("C", 2)],
        retentionByNode: new Map([
          ["A", STALE_RETENTION_THRESHOLD - 0.01],
          ["B", STALE_RETENTION_THRESHOLD],
          // C is missing from the map, defaulting to 0 (stale).
        ]),
      }),
    );
    expect(atlas.staleness).toEqual([
      { nodeId: "A", label: "光合作用" },
      { nodeId: "C", label: "暗反应" },
    ]);
  });
});
