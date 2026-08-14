/**
 * Purpose: one focus session's subway map (spec 042 §4) — every station and link always drawn
 * (nothing hides), the current line amber, the rest grey; clicking a station jumps to it, no
 * other affordance. Visual vocabulary matches the old station map's (dot r5, current ring,
 * dashed = 3 3), spec 040's provenance-tree view that spec 042 §6 retired.
 * Main exports: FocusMap.
 */
import { layoutFocusMap } from "../lib/focusMapLayout";
import { useFocusStore } from "../stores/focusStore";

const DOT_RADIUS = 5;
const LABEL_MAX_CHARS = 8;
const ACTIVE_COLOR = "#f59e0b";
const INACTIVE_DOT_COLOR = "#78716c";
const INACTIVE_LINE_COLOR = "#d6d3d1";

function truncateLabel(label: string): string {
  return label.length > LABEL_MAX_CHARS ? `${label.slice(0, LABEL_MAX_CHARS)}…` : label;
}

function activateOnKey(event: React.KeyboardEvent, action: () => void) {
  if (event.key === "Enter" || event.key === " ") action();
}

export function FocusMap() {
  const nodes = useFocusStore((state) => state.nodes);
  const currentNodeId = useFocusStore((state) => state.currentNodeId);
  const jumpTo = useFocusStore((state) => state.jumpTo);

  const layout = layoutFocusMap(
    nodes.map((node) => ({
      id: node.id,
      label: node.label,
      kind: node.kind,
      parentId: node.parent_id,
    })),
    currentNodeId,
  );

  if (layout.stations.length === 0) return null;

  return (
    <svg width={layout.width} height={layout.height} role="img" aria-label="专注地铁图">
      {layout.links.map((link) => (
        <line
          key={`${link.x1},${link.y1}-${link.x2},${link.y2}`}
          x1={link.x1}
          y1={link.y1}
          x2={link.x2}
          y2={link.y2}
          stroke={INACTIVE_LINE_COLOR}
          strokeWidth={1.2}
          strokeDasharray={link.dashed ? "3 3" : undefined}
        />
      ))}
      {layout.stations.map((station) => {
        const color = station.onCurrentPath ? ACTIVE_COLOR : INACTIVE_DOT_COLOR;
        const activate = () => jumpTo(station.id);
        return (
          <g key={station.id}>
            {station.isCurrent && (
              <circle
                cx={station.x}
                cy={station.y}
                r={DOT_RADIUS + 3}
                fill="none"
                stroke={ACTIVE_COLOR}
                strokeWidth={1.2}
              />
            )}
            {/* biome-ignore lint/a11y/useSemanticElements: SVG nodes cannot be <button> elements */}
            <g
              role="button"
              tabIndex={0}
              aria-label={`跳转到「${station.label}」`}
              style={{ cursor: "pointer" }}
              onClick={activate}
              onKeyDown={(event) => activateOnKey(event, activate)}
            >
              <circle
                cx={station.x}
                cy={station.y}
                r={DOT_RADIUS}
                fill={color}
                stroke="white"
                strokeWidth={1}
              />
              <text x={station.x + 10} y={station.y + 4} fontSize={11} fill="#57534e">
                {truncateLabel(station.label)}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
