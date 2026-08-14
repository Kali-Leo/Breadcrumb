/**
 * Purpose: unit tests for the settled-content lists — the node encounter/retention
 * threshold (both conditions required), the word stability threshold, sort order, and the
 * empty case.
 */
import type { DiglotWordStateRow, NodeSightingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import {
  computeSettled,
  NODE_SETTLED_ENCOUNTER_COUNT,
  NODE_SETTLED_RETENTION,
  WORD_SETTLED_STABILITY_DAYS,
} from "./settled";

function sightingsFor(nodeId: string, count: number): NodeSightingRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `s-${nodeId}-${index}`,
    node_id: nodeId,
    conversation_id: "c1",
    message_id: null,
    created_at: "2026-08-01T00:00:00.000Z",
    origin_node_id: null,
  }));
}

function wordState(lemma: string, stability: number): DiglotWordStateRow {
  return {
    lemma,
    pair: "zh:en",
    fsrs_json: JSON.stringify({
      stability,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 1,
      lapses: 0,
      state: 2,
      due: "2026-08-01T00:00:00.000Z",
      last_review: "2026-08-01T00:00:00.000Z",
    }),
    due: "2026-08-01T00:00:00.000Z",
    introduced_at: "2026-07-01T00:00:00.000Z",
    last_event_at: null,
  };
}

const nodeTitleById = new Map([
  ["settled-node", "settled title"],
  ["low-count", "low count title"],
  ["low-retention", "low retention title"],
]);

describe("computeSettled", () => {
  it("returns empty lists for empty input", () => {
    expect(
      computeSettled({ sightings: [], nodeTitleById, retentionByNode: new Map(), wordStates: [] }),
    ).toEqual({ nodes: [], words: [] });
  });

  it("requires both the encounter count and retention thresholds", () => {
    const sightings = [
      ...sightingsFor("settled-node", NODE_SETTLED_ENCOUNTER_COUNT),
      ...sightingsFor("low-count", NODE_SETTLED_ENCOUNTER_COUNT - 1),
      ...sightingsFor("low-retention", NODE_SETTLED_ENCOUNTER_COUNT),
    ];
    const retentionByNode = new Map([
      ["settled-node", NODE_SETTLED_RETENTION],
      ["low-count", NODE_SETTLED_RETENTION],
      ["low-retention", NODE_SETTLED_RETENTION - 0.01],
    ]);
    const result = computeSettled({ sightings, nodeTitleById, retentionByNode, wordStates: [] });
    expect(result.nodes).toEqual([
      {
        nodeId: "settled-node",
        title: "settled title",
        encounterCount: NODE_SETTLED_ENCOUNTER_COUNT,
      },
    ]);
  });

  it("splits words at the stability threshold, inclusive, and sorts most-stable first", () => {
    const wordStates = [
      wordState("below", WORD_SETTLED_STABILITY_DAYS - 1),
      wordState("exact", WORD_SETTLED_STABILITY_DAYS),
      wordState("high", WORD_SETTLED_STABILITY_DAYS + 20),
    ];
    const result = computeSettled({
      sightings: [],
      nodeTitleById,
      retentionByNode: new Map(),
      wordStates,
    });
    expect(result.words).toEqual([
      { lemma: "high", stabilityDays: WORD_SETTLED_STABILITY_DAYS + 20 },
      { lemma: "exact", stabilityDays: WORD_SETTLED_STABILITY_DAYS },
    ]);
  });

  it("sorts settled nodes by encounter count, most first", () => {
    const sightings = [
      ...sightingsFor("more", NODE_SETTLED_ENCOUNTER_COUNT + 3),
      ...sightingsFor("fewer", NODE_SETTLED_ENCOUNTER_COUNT),
    ];
    const retentionByNode = new Map([
      ["more", 1],
      ["fewer", 1],
    ]);
    const titles = new Map([
      ["more", "more"],
      ["fewer", "fewer"],
    ]);
    const result = computeSettled({
      sightings,
      nodeTitleById: titles,
      retentionByNode,
      wordStates: [],
    });
    expect(result.nodes.map((node) => node.nodeId)).toEqual(["more", "fewer"]);
  });
});
