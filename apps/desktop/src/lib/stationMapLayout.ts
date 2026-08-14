/**
 * Purpose: pure pixel-layout math for StationMap's SVG (spec 040 §3, tree-shaped by §7) —
 * vertical spacing for the main line and frontier by first-touch order, horizontal indent by
 * tree depth, one polyline connector per main-line parent-child edge (root stations connect
 * directly to the previous root, so the trunk still reads as continuous), plus each branch's
 * diagonal stub and vertical run. No rendering.
 * Main exports: ROW_HEIGHT, MAIN_X, MAIN_LINE_INDENT, BRANCH_X_OFFSET, TOP_MARGIN,
 * layoutStationMap, LaidOutStation, LaidOutConnector, LaidOutBranch, LaidOutFrontierStop,
 * StationMapLayout.
 */
import type { BranchStub, FrontierStop, Station, StationMapModel } from "./stationMapModel";

export const ROW_HEIGHT = 34;
export const MAIN_X = 24;
/** Horizontal shift per tree depth level on the main line (spec 040 §7: geometry = structure). */
export const MAIN_LINE_INDENT = 14;
export const BRANCH_X_OFFSET = 18;
export const TOP_MARGIN = 20;
export const BOTTOM_MARGIN = 20;

export interface LaidOutStation {
  station: Station;
  x: number;
  y: number;
}

/** One parent -> child polyline on the main line: straight down when x1 === x2 (a root
 * connecting to the previous root), an L-elbow otherwise (a station indenting to its parent). */
export interface LaidOutConnector {
  x1: number;
  y1: number;
  elbowY: number;
  x2: number;
  y2: number;
}

export interface LaidOutBranch {
  branch: BranchStub;
  originX: number;
  originY: number;
  stations: LaidOutStation[];
}

export interface LaidOutFrontierStop {
  stop: FrontierStop;
  x: number;
  y: number;
}

export interface StationMapLayout {
  mainLine: LaidOutStation[];
  mainLineConnectors: LaidOutConnector[];
  branches: LaidOutBranch[];
  frontier: LaidOutFrontierStop[];
  height: number;
}

/** The main-line row a branch visually forks off of: the last main-line station whose message
 * does not come after the fork point on the active path. -1 forks above the first station,
 * for a branch that split off before any station was reached. */
function anchorRowForFork(
  forkMessageId: string,
  activePathIds: readonly string[],
  mainLine: readonly Station[],
): number {
  const forkPosition = activePathIds.indexOf(forkMessageId);
  let anchor = -1;
  mainLine.forEach((station, row) => {
    const stationPosition = activePathIds.indexOf(station.messageId);
    if (stationPosition !== -1 && stationPosition <= forkPosition) anchor = row;
  });
  return anchor;
}

/** Each main-line station's connector source: its resolved parent when it has one, else the
 * nearest earlier root (parentNodeId null) — "root 之间仍按序直连" keeps the trunk unbroken
 * through indented side-stations. The very first root has no source (nothing above it). */
function connectorSourceRow(station: Station, index: number, mainLine: readonly Station[]): number {
  if (station.parentNodeId !== null) {
    return mainLine.findIndex((candidate) => candidate.nodeId === station.parentNodeId);
  }
  for (let row = index - 1; row >= 0; row -= 1) {
    if (mainLine[row]?.parentNodeId === null) return row;
  }
  return -1;
}

/** Lays out one line's stations, connecting lines, and total height. `activePathIds` (root to
 * the current leaf, in order) is only needed to anchor branches to the right main-line row. */
export function layoutStationMap(
  model: StationMapModel,
  activePathIds: readonly string[],
): StationMapLayout {
  const mainLine: LaidOutStation[] = model.mainLine.map((station, row) => ({
    station,
    x: MAIN_X + station.depth * MAIN_LINE_INDENT,
    y: TOP_MARGIN + row * ROW_HEIGHT,
  }));

  const mainLineConnectors: LaidOutConnector[] = [];
  model.mainLine.forEach((station, row) => {
    const sourceRow = connectorSourceRow(station, row, model.mainLine);
    if (sourceRow === -1) return;
    const source = mainLine[sourceRow] as LaidOutStation;
    const target = mainLine[row] as LaidOutStation;
    mainLineConnectors.push({
      x1: source.x,
      y1: source.y,
      elbowY: target.y - ROW_HEIGHT / 2,
      x2: target.x,
      y2: target.y,
    });
  });

  const branches: LaidOutBranch[] = model.branches.map((branch) => {
    const anchor = anchorRowForFork(branch.forkMessageId, activePathIds, model.mainLine);
    const originY = anchor === -1 ? TOP_MARGIN - ROW_HEIGHT : TOP_MARGIN + anchor * ROW_HEIGHT;
    const stations: LaidOutStation[] = branch.stations.map((station, row) => ({
      station,
      x: MAIN_X + BRANCH_X_OFFSET,
      y: originY + (row + 1) * ROW_HEIGHT,
    }));
    return { branch, originX: MAIN_X, originY, stations };
  });

  const frontierStartRow = model.mainLine.length;
  const mainLineBottomY = mainLine.at(-1)?.y ?? TOP_MARGIN;
  const frontier: LaidOutFrontierStop[] = model.frontier.map((stop, index) => ({
    stop,
    x: MAIN_X,
    y: TOP_MARGIN + (frontierStartRow + index) * ROW_HEIGHT,
  }));

  const bottoms = [
    TOP_MARGIN,
    mainLineBottomY,
    frontier.at(-1)?.y ?? TOP_MARGIN,
    ...branches.map((branch) => branch.stations.at(-1)?.y ?? branch.originY),
  ];
  const height = Math.max(...bottoms) + BOTTOM_MARGIN;

  return { mainLine, mainLineConnectors, branches, frontier, height };
}
