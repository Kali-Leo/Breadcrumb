/**
 * Purpose: pure pixel-layout math for StationMap's SVG (spec 040 §3) — vertical spacing for
 * the main line and frontier, plus each branch's diagonal stub and vertical run. No rendering.
 * Main exports: ROW_HEIGHT, MAIN_X, BRANCH_X_OFFSET, TOP_MARGIN, layoutStationMap,
 * LaidOutStation, LaidOutBranch, LaidOutFrontierStop, StationMapLayout.
 */
import type { BranchStub, FrontierStop, Station, StationMapModel } from "./stationMapModel";

export const ROW_HEIGHT = 34;
export const MAIN_X = 24;
export const BRANCH_X_OFFSET = 18;
export const TOP_MARGIN = 20;
export const BOTTOM_MARGIN = 20;

export interface LaidOutStation {
  station: Station;
  x: number;
  y: number;
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

/** Lays out one line's stations, connecting lines, and total height. `activePathIds` (root to
 * the current leaf, in order) is only needed to anchor branches to the right main-line row. */
export function layoutStationMap(
  model: StationMapModel,
  activePathIds: readonly string[],
): StationMapLayout {
  const mainLine: LaidOutStation[] = model.mainLine.map((station, row) => ({
    station,
    x: MAIN_X,
    y: TOP_MARGIN + row * ROW_HEIGHT,
  }));

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
  const frontier: LaidOutFrontierStop[] = model.frontier.map((stop, index) => ({
    stop,
    x: MAIN_X,
    y: TOP_MARGIN + (frontierStartRow + index) * ROW_HEIGHT,
  }));

  const bottoms = [
    TOP_MARGIN,
    mainLine.at(-1)?.y ?? TOP_MARGIN,
    frontier.at(-1)?.y ?? TOP_MARGIN,
    ...branches.map((branch) => branch.stations.at(-1)?.y ?? branch.originY),
  ];
  const height = Math.max(...bottoms) + BOTTOM_MARGIN;

  return { mainLine, branches, frontier, height };
}
