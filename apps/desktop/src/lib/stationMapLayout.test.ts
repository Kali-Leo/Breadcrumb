/**
 * Purpose: unit tests for layoutStationMap — main-line row spacing, depth-driven indent,
 * parent/root connector endpoints, branch anchoring to the right main-line row, and frontier
 * stops continuing below the main line.
 */
import { describe, expect, it } from "vitest";
import {
  layoutStationMap,
  MAIN_LINE_INDENT,
  MAIN_X,
  ROW_HEIGHT,
  TOP_MARGIN,
} from "./stationMapLayout";
import type { Station, StationMapModel } from "./stationMapModel";

function station(
  nodeId: string,
  messageId: string,
  onActivePath: boolean,
  parentNodeId: string | null = null,
  depth = 0,
): Station {
  return {
    nodeId,
    label: nodeId,
    messageId,
    index: 0,
    onActivePath,
    stale: false,
    transfer: false,
    parentNodeId,
    depth,
    order: 1,
  };
}

describe("layoutStationMap — main-line rows and indent", () => {
  it("spaces stations vertically by row and horizontally by depth", () => {
    const model: StationMapModel = {
      mainLine: [station("a", "m1", true, null, 0), station("b", "m2", true, "a", 1)],
      branches: [],
      frontier: [],
      currentMessageId: "m2",
    };
    const layout = layoutStationMap(model, ["m1", "m2"]);
    expect(layout.mainLine).toEqual([
      { station: model.mainLine[0], x: MAIN_X, y: TOP_MARGIN },
      { station: model.mainLine[1], x: MAIN_X + MAIN_LINE_INDENT, y: TOP_MARGIN + ROW_HEIGHT },
    ]);
  });
});

describe("layoutStationMap — main-line connectors", () => {
  it("draws an L-elbow connector from a station to its resolved parent", () => {
    const model: StationMapModel = {
      mainLine: [
        station("a", "m1", true, null, 0),
        station("b", "m2", true, null, 0),
        station("c", "m3", true, "a", 1), // parent is the non-adjacent earlier station "a"
      ],
      branches: [],
      frontier: [],
      currentMessageId: "m3",
    };
    const layout = layoutStationMap(model, ["m1", "m2", "m3"]);
    // a -> b: both roots, connects to the previous root directly (straight vertical).
    // a -> c: parent edge, L-elbow at c's row minus half a row height.
    expect(layout.mainLineConnectors).toEqual([
      {
        x1: MAIN_X,
        y1: TOP_MARGIN,
        elbowY: TOP_MARGIN + ROW_HEIGHT - ROW_HEIGHT / 2,
        x2: MAIN_X,
        y2: TOP_MARGIN + ROW_HEIGHT,
      },
      {
        x1: MAIN_X,
        y1: TOP_MARGIN,
        elbowY: TOP_MARGIN + 2 * ROW_HEIGHT - ROW_HEIGHT / 2,
        x2: MAIN_X + MAIN_LINE_INDENT,
        y2: TOP_MARGIN + 2 * ROW_HEIGHT,
      },
    ]);
  });

  it("skips a non-root indented station and links the next root to the previous root", () => {
    const model: StationMapModel = {
      mainLine: [
        station("a", "m1", true, null, 0),
        station("b", "m2", true, "a", 1), // child of a, indented — not a root
        station("c", "m3", true, null, 0), // next root: connects straight to a, not b
      ],
      branches: [],
      frontier: [],
      currentMessageId: "m3",
    };
    const layout = layoutStationMap(model, ["m1", "m2", "m3"]);
    const rootToRoot = layout.mainLineConnectors.find(
      (connector) => connector.y2 === TOP_MARGIN + 2 * ROW_HEIGHT,
    );
    expect(rootToRoot?.y1).toBe(TOP_MARGIN); // sourced from "a" (row 0), not "b" (row 1)
    expect(rootToRoot?.x1).toBe(MAIN_X);
    expect(rootToRoot?.x2).toBe(MAIN_X);
  });

  it("the first root has no connector above it", () => {
    const model: StationMapModel = {
      mainLine: [station("a", "m1", true, null, 0)],
      branches: [],
      frontier: [],
      currentMessageId: "m1",
    };
    const layout = layoutStationMap(model, ["m1"]);
    expect(layout.mainLineConnectors).toEqual([]);
  });
});

describe("layoutStationMap — branches and frontier", () => {
  it("anchors a branch to the main-line row at or before its fork point", () => {
    const model: StationMapModel = {
      mainLine: [station("a", "m1", true), station("b", "m3", true)],
      branches: [{ forkMessageId: "m2", stations: [station("c", "m2b", false)], leafId: "leaf" }],
      frontier: [],
      currentMessageId: "m3",
    };
    // active path: m1 -> m2 -> m3; fork off m2 sits after main-line row 0 ("a"@m1) and
    // before row 1 ("b"@m3), so it anchors to row 0.
    const layout = layoutStationMap(model, ["m1", "m2", "m3"]);
    expect(layout.branches[0]?.originY).toBe(TOP_MARGIN);
    expect(layout.branches[0]?.stations[0]?.y).toBe(TOP_MARGIN + ROW_HEIGHT);
  });

  it("continues the frontier below the main line and grows height accordingly", () => {
    const model: StationMapModel = {
      mainLine: [station("a", "m1", true)],
      branches: [],
      frontier: [{ nodeId: "z", label: "z", viaLabel: "a" }],
      currentMessageId: "m1",
    };
    const layout = layoutStationMap(model, ["m1"]);
    expect(layout.frontier[0]?.y).toBe(TOP_MARGIN + ROW_HEIGHT);
    expect(layout.height).toBeGreaterThan(layout.frontier[0]?.y ?? 0);
  });
});
