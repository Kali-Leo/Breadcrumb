/**
 * Purpose: unit tests for layoutStationMap — main line spacing, branch anchoring to the right
 * main-line row, and frontier stops continuing below the main line.
 */
import { describe, expect, it } from "vitest";
import { layoutStationMap, MAIN_X, ROW_HEIGHT, TOP_MARGIN } from "./stationMapLayout";
import type { StationMapModel } from "./stationMapModel";

function station(nodeId: string, messageId: string, onActivePath: boolean) {
  return {
    nodeId,
    label: nodeId,
    messageId,
    index: 0,
    onActivePath,
    stale: false,
    transfer: false,
  };
}

describe("layoutStationMap", () => {
  it("spaces main-line stations vertically at x=MAIN_X", () => {
    const model: StationMapModel = {
      mainLine: [station("a", "m1", true), station("b", "m2", true)],
      branches: [],
      frontier: [],
      currentMessageId: "m2",
    };
    const layout = layoutStationMap(model, ["m1", "m2"]);
    expect(layout.mainLine).toEqual([
      { station: model.mainLine[0], x: MAIN_X, y: TOP_MARGIN },
      { station: model.mainLine[1], x: MAIN_X, y: TOP_MARGIN + ROW_HEIGHT },
    ]);
  });

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
