/**
 * Purpose: tests for door candidate selection — mastery/opened/short-label filtering, the
 * density cap, priority ordering, overlap rejection (including reserved spans) and case
 * insensitivity (spec 039 acceptance 2).
 */
import { describe, expect, it } from "vitest";
import {
  DOOR_LIT_THRESHOLD,
  type DoorPickInput,
  MAX_DOORS_PER_MESSAGE,
  pickDoors,
} from "./doorPick";

function baseInput(overrides: Partial<DoorPickInput>): DoorPickInput {
  return {
    messageText: "光合作用把光能转化为化学能，储存在葡萄糖中。",
    messageNodes: [
      { nodeId: "n-photosynthesis", label: "光合作用" },
      { nodeId: "n-glucose", label: "葡萄糖" },
    ],
    masteryByNode: new Map(),
    curiosityByNode: new Map(),
    retentionByNode: new Map(),
    alreadyOpenedNodeIds: new Set(),
    ...overrides,
  };
}

describe("pickDoors", () => {
  it("returns nothing for an empty message", () => {
    expect(pickDoors(baseInput({ messageText: "", messageNodes: [] }))).toEqual([]);
  });

  it("skips nodes at or above the lit threshold", () => {
    const doors = pickDoors(
      baseInput({ masteryByNode: new Map([["n-photosynthesis", DOOR_LIT_THRESHOLD]]) }),
    );
    expect(doors.map((door) => door.nodeId)).toEqual(["n-glucose"]);
  });

  it("skips nodes already opened as doors this conversation", () => {
    const doors = pickDoors(baseInput({ alreadyOpenedNodeIds: new Set(["n-glucose"]) }));
    expect(doors.map((door) => door.nodeId)).toEqual(["n-photosynthesis"]);
  });

  it("skips labels shorter than two characters", () => {
    const doors = pickDoors(
      baseInput({
        messageText: "力是物理量。",
        messageNodes: [{ nodeId: "n-force", label: "力" }],
      }),
    );
    expect(doors).toEqual([]);
  });

  it("silently skips a node whose label does not appear in the text", () => {
    const doors = pickDoors(
      baseInput({
        messageNodes: [{ nodeId: "n-missing", label: "光反应" }],
      }),
    );
    expect(doors).toEqual([]);
  });

  it("matches case-insensitively but returns the original-case slice", () => {
    const doors = pickDoors(
      baseInput({
        messageText: "The Mitochondria is the powerhouse.",
        messageNodes: [{ nodeId: "n-mito", label: "mitochondria" }],
      }),
    );
    expect(doors).toHaveLength(1);
    expect(doors[0]?.original).toBe("Mitochondria");
  });

  it("caps density at three, preferring high curiosity then low retention", () => {
    const doors = pickDoors(
      baseInput({
        messageText: "AA BB CC DD 都出现在这句话里。",
        messageNodes: [
          { nodeId: "n-a", label: "AA" },
          { nodeId: "n-b", label: "BB" },
          { nodeId: "n-c", label: "CC" },
          { nodeId: "n-d", label: "DD" },
        ],
        curiosityByNode: new Map([
          ["n-a", 0.9],
          ["n-b", 0.9],
          ["n-c", 0.1],
          ["n-d", 0.1],
        ]),
        retentionByNode: new Map([
          ["n-a", 0.2],
          ["n-b", 0.8],
          ["n-c", 0.1],
          ["n-d", 0.9],
        ]),
      }),
    );
    expect(doors).toHaveLength(MAX_DOORS_PER_MESSAGE);
    expect(doors.map((door) => door.nodeId)).not.toContain("n-d");
  });

  it("drops candidates overlapping a higher-priority pick", () => {
    const doors = pickDoors(
      baseInput({
        messageText: "光合作用",
        messageNodes: [
          { nodeId: "n-photosynthesis", label: "光合作用" },
          { nodeId: "n-photo", label: "光合" },
        ],
        curiosityByNode: new Map([
          ["n-photosynthesis", 0.9],
          ["n-photo", 0.9],
        ]),
      }),
    );
    expect(doors).toHaveLength(1);
    expect(doors[0]?.nodeId).toBe("n-photosynthesis");
  });

  it("drops candidates overlapping a reserved span", () => {
    const doors = pickDoors(
      baseInput({
        messageText: "光合作用把光能转化为化学能，储存在葡萄糖中。",
        reservedSpans: [{ start: 0, end: 4 }],
      }),
    );
    expect(doors.map((door) => door.nodeId)).toEqual(["n-glucose"]);
  });

  it("returns candidates sorted by start position, not priority", () => {
    const doors = pickDoors(
      baseInput({
        curiosityByNode: new Map([
          ["n-glucose", 0.9],
          ["n-photosynthesis", 0.1],
        ]),
      }),
    );
    expect(doors.map((door) => door.nodeId)).toEqual(["n-photosynthesis", "n-glucose"]);
  });
});

describe("pickDoors exploration slot (2026-08-28 audit: deterministic, no bandit)", () => {
  /** Four candidates, all matchable and non-overlapping, in a fixed text. */
  function fourCandidates(
    curiosityByNode: ReadonlyMap<string, number>,
    retentionByNode: ReadonlyMap<string, number>,
  ) {
    return pickDoors(
      baseInput({
        messageText: "AA BB CC DD 都出现在这句话里。",
        messageNodes: [
          { nodeId: "n-a", label: "AA" },
          { nodeId: "n-b", label: "BB" },
          { nodeId: "n-c", label: "CC" },
          { nodeId: "n-d", label: "DD" },
        ],
        curiosityByNode,
        retentionByNode,
      }),
    ).map((door) => door.nodeId);
  }

  it("gives the last door to a candidate curiosity ranking did not pick", () => {
    // Curiosity order is a > b > c > d, so a pure top-3 would return a, b, c forever. The
    // exploration slot goes to the lowest-retention leftover instead — which is d.
    const doors = fourCandidates(
      new Map([
        ["n-a", 0.9],
        ["n-b", 0.8],
        ["n-c", 0.7],
        ["n-d", 0.1],
      ]),
      new Map([
        ["n-a", 0.5],
        ["n-b", 0.5],
        ["n-c", 0.9],
        ["n-d", 0.1],
      ]),
    );
    expect(doors).toEqual(["n-a", "n-b", "n-d"]);
  });

  it("is deterministic: the same input always produces the same third door", () => {
    const curiosity = new Map([
      ["n-a", 0.9],
      ["n-b", 0.8],
      ["n-c", 0.7],
      ["n-d", 0.1],
    ]);
    const retention = new Map([
      ["n-a", 0.5],
      ["n-b", 0.5],
      ["n-c", 0.2],
      ["n-d", 0.2],
    ]);
    const first = fourCandidates(curiosity, retention);
    expect(fourCandidates(curiosity, retention)).toEqual(first);
    // Tied retention keeps curiosity order, so c (the higher-curiosity of the tie) wins.
    expect(first).toEqual(["n-a", "n-b", "n-c"]);
  });

  it("still fills the last door from curiosity ranking when only three candidates exist", () => {
    const doors = pickDoors(
      baseInput({
        messageText: "AA BB CC 都出现在这句话里。",
        messageNodes: [
          { nodeId: "n-a", label: "AA" },
          { nodeId: "n-b", label: "BB" },
          { nodeId: "n-c", label: "CC" },
        ],
        curiosityByNode: new Map([
          ["n-a", 0.9],
          ["n-b", 0.8],
          ["n-c", 0.7],
        ]),
      }),
    );
    expect(doors.map((door) => door.nodeId)).toEqual(["n-a", "n-b", "n-c"]);
  });
});
