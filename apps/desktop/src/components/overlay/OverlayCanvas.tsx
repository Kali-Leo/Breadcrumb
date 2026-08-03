/**
 * Purpose: pure SVG rendering of one OverlayModel (spec 017 #2) — lit/dim/target node
 * styling, requires/helps edges, and the next-step node's pulsing halo. No data fetching,
 * no store access; the parent (GoalOverlayView) owns hover/click state and passes handlers.
 * Main exports: OverlayCanvas.
 */

import { shortenSegment, truncateLabel } from "../../lib/overlayGeometry";
import { OVERLAY_NODE_HEIGHT, OVERLAY_NODE_WIDTH, type OverlayModel } from "../../lib/overlayModel";

const MARGIN = 32;
const LABEL_MAX_CHARS = 9;

const NODE_STYLE_BY_STATE: Record<
  OverlayModel["nodes"][number]["state"],
  { fill: string; fillOpacity: number; stroke: string; dashed: boolean }
> = {
  lit: { fill: "#fef3c7", fillOpacity: 1, stroke: "#f59e0b", dashed: false },
  dim: { fill: "#fef3c7", fillOpacity: 0.5, stroke: "#fbbf24", dashed: false },
  target: { fill: "#ffffff", fillOpacity: 1, stroke: "#a8a29e", dashed: true },
};

interface OverlayCanvasProps {
  model: OverlayModel;
  hoveredNodeId: string | null;
  onHoverNode(nodeId: string | null, event: React.MouseEvent | null): void;
  onClickNode(nodeId: string): void;
}

export function OverlayCanvas({
  model,
  hoveredNodeId,
  onHoverNode,
  onClickNode,
}: OverlayCanvasProps) {
  const positionById = new Map(model.nodes.map((node) => [node.id, { x: node.x, y: node.y }]));

  return (
    <svg
      role="img"
      aria-label="目标对照图"
      width={model.width + MARGIN * 2}
      height={model.height + MARGIN * 2}
      viewBox={`${-MARGIN} ${-MARGIN} ${model.width + MARGIN * 2} ${model.height + MARGIN * 2}`}
    >
      <defs>
        <marker
          id="overlay-requires-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 0L10 5L0 10z" fill="#78716c" />
        </marker>
      </defs>

      {model.edges.map((edge) => {
        const from = positionById.get(edge.source);
        const to = positionById.get(edge.target);
        if (from === undefined || to === undefined) return null;
        const isRequires = edge.type === "requires";
        const { from: start, to: end } = shortenSegment(
          from,
          to,
          OVERLAY_NODE_WIDTH / 2,
          OVERLAY_NODE_WIDTH / 2,
        );
        return (
          <line
            key={`${edge.source}-${edge.type}-${edge.target}`}
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            stroke={isRequires ? "#78716c" : "#fcd34d"}
            strokeWidth={isRequires ? 1.5 : Math.min(3, 1 + edge.weight * 2)}
            markerEnd={isRequires ? "url(#overlay-requires-arrow)" : undefined}
          />
        );
      })}

      {model.nodes.map((node) => {
        const style = NODE_STYLE_BY_STATE[node.state];
        const boxX = node.x - OVERLAY_NODE_WIDTH / 2;
        const boxY = node.y - OVERLAY_NODE_HEIGHT / 2;
        return (
          // biome-ignore lint/a11y/useSemanticElements: <button> isn't valid inside <svg>; role+tabIndex+onKeyDown covers keyboard access.
          <g
            key={node.id}
            role="button"
            tabIndex={0}
            aria-label={node.label}
            className="cursor-pointer focus:outline-none"
            onMouseEnter={(event) => onHoverNode(node.id, event)}
            onMouseMove={(event) => onHoverNode(node.id, event)}
            onMouseLeave={() => onHoverNode(null, null)}
            onClick={() => onClickNode(node.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") onClickNode(node.id);
            }}
          >
            {node.isNextStep && (
              <rect
                x={boxX - 6}
                y={boxY - 6}
                width={OVERLAY_NODE_WIDTH + 12}
                height={OVERLAY_NODE_HEIGHT + 12}
                rx={12}
                fill="none"
                stroke="#f59e0b"
                strokeWidth={2}
                className="animate-pulse"
              />
            )}
            <rect
              x={boxX}
              y={boxY}
              width={OVERLAY_NODE_WIDTH}
              height={OVERLAY_NODE_HEIGHT}
              rx={8}
              fill={style.fill}
              fillOpacity={style.fillOpacity}
              stroke={hoveredNodeId === node.id ? "#d97706" : style.stroke}
              strokeWidth={hoveredNodeId === node.id ? 2.5 : 1.5}
              strokeDasharray={style.dashed ? "5 4" : undefined}
            />
            <text
              x={node.x}
              y={node.y}
              textAnchor="middle"
              dominantBaseline="central"
              className="pointer-events-none select-none fill-stone-700"
              fontSize={13}
            >
              {truncateLabel(node.label, LABEL_MAX_CHARS)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
