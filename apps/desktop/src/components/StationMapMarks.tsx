/**
 * Purpose: StationMap's SVG marks — one visited station (dot + label + "续" resume button),
 * one branch stub (fork line + its stations), one hollow frontier stop. Pure presentation,
 * callbacks passed in; split out to keep StationMap.tsx under the file-size cap.
 * Main exports: VisitedStationMark, BranchStubMark, FrontierStopMark.
 */
import { EXPLORE_UI_COPY, frontierStopPrefill } from "@breadcrumb/plugin-explore";
import {
  BRANCH_X_OFFSET,
  type LaidOutBranch,
  type LaidOutStation,
  MAIN_X,
} from "../lib/stationMapLayout";

const DOT_RADIUS = 5;
const RESUME_X = 218;
const LABEL_MAX_CHARS = 8;
const LINE_STROKE = "#d6d3d1";

function truncateLabel(label: string): string {
  return label.length > LABEL_MAX_CHARS ? `${label.slice(0, LABEL_MAX_CHARS)}…` : label;
}

function activateOnKey(event: React.KeyboardEvent, action: () => void) {
  if (event.key === "Enter" || event.key === " ") action();
}

export function VisitedStationMark({
  laidOut: { station, x, y },
  isCurrent,
  onLocate,
  onResume,
}: {
  laidOut: LaidOutStation;
  isCurrent: boolean;
  onLocate(messageId: string): void;
  onResume(messageId: string): void;
}) {
  const fill = station.stale ? "#d6d3d1" : station.onActivePath ? "#f59e0b" : "#78716c";
  return (
    <g>
      {isCurrent && (
        <circle cx={x} cy={y} r={DOT_RADIUS + 3} fill="none" stroke="#f59e0b" strokeWidth={1.2} />
      )}
      {/* biome-ignore lint/a11y/useSemanticElements: SVG nodes cannot be <button> elements */}
      <g
        role="button"
        tabIndex={0}
        aria-label={`定位到「${station.label}」`}
        style={{ cursor: "pointer" }}
        onClick={() => onLocate(station.messageId)}
        onKeyDown={(event) => activateOnKey(event, () => onLocate(station.messageId))}
      >
        <circle cx={x} cy={y} r={DOT_RADIUS} fill={fill} stroke="white" strokeWidth={1} />
        <text x={x + 16} y={y + 4} fontSize={11} fill="#57534e">
          {truncateLabel(station.label)}
        </text>
      </g>
      {/* biome-ignore lint/a11y/useSemanticElements: SVG nodes cannot be <button> elements */}
      <text
        role="button"
        tabIndex={0}
        aria-label={`从「${station.label}」继续`}
        x={RESUME_X}
        y={y + 4}
        fontSize={11}
        fill="#b45309"
        textAnchor="end"
        style={{ cursor: "pointer" }}
        onClick={() => onResume(station.messageId)}
        onKeyDown={(event) => activateOnKey(event, () => onResume(station.messageId))}
      >
        {EXPLORE_UI_COPY.stationResumeButton}
      </text>
    </g>
  );
}

export function BranchStubMark({
  laidOutBranch,
  onLocate,
  onResume,
}: {
  laidOutBranch: LaidOutBranch;
  onLocate(messageId: string): void;
  onResume(messageId: string): void;
}) {
  const firstStation = laidOutBranch.stations[0];
  const branchBottomY = laidOutBranch.stations.at(-1)?.y ?? laidOutBranch.originY;
  return (
    <g>
      {firstStation && (
        <line
          x1={laidOutBranch.originX}
          y1={laidOutBranch.originY}
          x2={firstStation.x}
          y2={firstStation.y}
          stroke={LINE_STROKE}
          strokeWidth={1}
        />
      )}
      {firstStation && laidOutBranch.stations.length > 1 && (
        <line
          x1={MAIN_X + BRANCH_X_OFFSET}
          y1={firstStation.y}
          x2={MAIN_X + BRANCH_X_OFFSET}
          y2={branchBottomY}
          stroke={LINE_STROKE}
          strokeWidth={1}
        />
      )}
      {laidOutBranch.stations.map((laidOutStation) => (
        <VisitedStationMark
          key={laidOutStation.station.nodeId}
          laidOut={laidOutStation}
          isCurrent={false}
          onLocate={onLocate}
          onResume={onResume}
        />
      ))}
    </g>
  );
}

export function FrontierStopMark({
  x,
  y,
  label,
  onAskAbout,
}: {
  x: number;
  y: number;
  label: string;
  onAskAbout(label: string): void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: SVG nodes cannot be <button> elements
    <g
      role="button"
      tabIndex={0}
      aria-label={frontierStopPrefill(label)}
      style={{ cursor: "pointer" }}
      onClick={() => onAskAbout(label)}
      onKeyDown={(event) => activateOnKey(event, () => onAskAbout(label))}
    >
      <circle cx={x} cy={y} r={DOT_RADIUS} fill="none" stroke="#a8a29e" strokeWidth={1.2} />
      <text x={x + 16} y={y + 4} fontSize={11} fill="#a8a29e">
        {truncateLabel(label)}
      </text>
    </g>
  );
}
