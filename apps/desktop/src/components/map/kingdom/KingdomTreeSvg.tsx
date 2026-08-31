/**
 * Purpose: the subway-map tree rendering (spec 049, 2026-08-31 修订) — deterministic
 * tidy-tree stations with minimal neutral state marks: done filled, visited outlined amber,
 * untouched outlined grey, aggregates as counted boxes, recommended stations marked with
 * the same Material "place" pin the world map uses, goal-domain members ticked. Lateral
 * requires/helps edges draw as arrowed lines (solid/dashed). Opens centered on the primary
 * recommendation; double-click enters a station. Logic lives in kingdomView.ts.
 * Main exports: KingdomTreeSvg.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { layoutFocusMap } from "../../../lib/focusMapLayout";
import type { LateralEdgeView, VisibleTreeNode } from "../../../lib/kingdomView";

const AMBER = "#f59e0b";
const GREY = "#a8a29e";
const LINE = "#d6d3d1";
const TEXT = "#57534e";
const DOT_RADIUS = 5;
const LABEL_MAX_CHARS = 12;
/** Google Material Icons "place" (Apache-2.0) — same official asset as the world map's
 * recommendation pins, so "recommended here" reads as one symbol everywhere. 24×24 viewBox,
 * tip at (12, ~21.5). */
const PIN_PATH =
  "M12 2C8.13 2 5 5.13 5 8.5c0 5.25 7 13 7 13s7-7.75 7-13C19 5.13 15.87 2 12 2zm0 9.5c-1.66 " +
  "0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z";
const PIN_SCALE = 0.75;
/** Fit-to-pane floor (same rule as the focus map): below this the pane scrolls instead —
 * stations smaller than that stop being readable or clickable. */
const MIN_SCALE = 0.55;
const PANE_PADDING = 16;

/** Tracks the pane's rendered content-box size — the fit calculation needs real pixels. */
function usePaneSize(): [
  React.RefObject<HTMLDivElement | null>,
  { width: number; height: number },
] {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) return;
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}

interface KingdomTreeSvgProps {
  visibleNodes: readonly VisibleTreeNode[];
  lateralEdges: readonly LateralEdgeView[];
  primaryId: string | null;
  /** Stations carrying a map pin — the global recommendation set's members here. */
  pinnedIds: ReadonlySet<string>;
  selectedId: string | null;
  onSelect(nodeId: string): void;
  /** Double-click: straight into the station's main action (Leo 2026-08-31 #3). */
  onEnter(nodeId: string): void;
  onHover(nodeId: string | null): void;
  onExpandAggregate(nodeId: string): void;
}

function truncate(label: string): string {
  return label.length > LABEL_MAX_CHARS ? `${label.slice(0, LABEL_MAX_CHARS)}…` : label;
}

export function KingdomTreeSvg({
  visibleNodes,
  lateralEdges,
  primaryId,
  pinnedIds,
  selectedId,
  onSelect,
  onEnter,
  onHover,
  onExpandAggregate,
}: KingdomTreeSvgProps) {
  const { t } = useTranslation("palace");
  const [paneRef, paneSize] = usePaneSize();
  // Open centered (Leo 2026-08-31 #2): once per mount, put the primary recommendation —
  // or the tree's middle when there is none — in the middle of the pane.
  const centeredRef = useRef(false);
  useEffect(() => {
    if (centeredRef.current) return;
    const pane = paneRef.current;
    if (pane === null || pane.clientWidth === 0) return;
    centeredRef.current = true;
    const primary =
      primaryId === null ? null : pane.querySelector(`[data-station-id="${primaryId}"]`);
    if (primary !== null) {
      primary.scrollIntoView({ block: "center", inline: "center" });
      return;
    }
    pane.scrollLeft = (pane.scrollWidth - pane.clientWidth) / 2;
    pane.scrollTop = (pane.scrollHeight - pane.clientHeight) / 2;
  });
  const layout = layoutFocusMap(
    visibleNodes.map((node) => ({
      id: node.id,
      label: node.label,
      kind: "word" as const,
      parentId: node.parentId,
    })),
    selectedId ?? "",
  );
  const positionById = new Map(layout.stations.map((station) => [station.id, station]));
  const nodeById = new Map(visibleNodes.map((node) => [node.id, node]));

  if (layout.stations.length === 0) {
    return <p className="p-4 text-sm text-stone-400">{t("kingdom.treeEmpty")}</p>;
  }

  // Shrink to fit the pane (never grow); past the floor the pane scrolls (spec 050 §1).
  const fitScale =
    paneSize.width > 0 && paneSize.height > 0
      ? Math.min(
          (paneSize.width - PANE_PADDING * 2) / layout.width,
          (paneSize.height - PANE_PADDING * 2) / layout.height,
          1,
        )
      : 1;
  const scale = Math.max(MIN_SCALE, fitScale);

  return (
    <div ref={paneRef} className="flex h-full w-full overflow-auto p-4">
      <svg
        className="m-auto"
        width={layout.width * scale}
        height={layout.height * scale}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label={t("kingdom.treeAria")}
      >
        <defs>
          <marker
            id="lateral-arrow"
            markerWidth="6"
            markerHeight="6"
            refX="6"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L6,3 L0,6" fill="none" stroke={GREY} strokeWidth="1" />
          </marker>
        </defs>
        {layout.links.map((link) => (
          <polyline
            key={link.points.map((point) => `${point.x},${point.y}`).join("-")}
            points={link.points.map((point) => `${point.x},${point.y}`).join(" ")}
            fill="none"
            stroke={LINE}
            strokeWidth={1.2}
          />
        ))}
        {lateralEdges.map((edge) => {
          const source = positionById.get(edge.sourceId);
          const target = positionById.get(edge.targetId);
          if (source === undefined || target === undefined) return null;
          return (
            <line
              key={`${edge.sourceId}-${edge.targetId}-${edge.edgeType}`}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke={GREY}
              strokeWidth={1}
              strokeDasharray={edge.edgeType === "helps" ? "4 3" : undefined}
              markerEnd="url(#lateral-arrow)"
            />
          );
        })}
        {layout.stations.map((station) => {
          const node = nodeById.get(station.id);
          if (node === undefined) return null;
          const isAggregate = node.collapsedCount !== null;
          const isPinned = pinnedIds.has(station.id);
          const isSelected = station.id === selectedId;
          const dotFill = node.state === "done" ? AMBER : "white";
          const dotStroke = node.state === "untouched" ? GREY : AMBER;
          const activate = () =>
            isAggregate ? onExpandAggregate(station.id) : onSelect(station.id);
          return (
            // biome-ignore lint/a11y/useSemanticElements: SVG nodes cannot be <button> elements
            <g
              key={station.id}
              role="button"
              tabIndex={0}
              aria-label={
                isAggregate
                  ? t("kingdom.expandNode", { label: node.label })
                  : t("kingdom.viewNode", { label: node.label })
              }
              data-station-id={station.id}
              style={{ cursor: "pointer" }}
              onClick={activate}
              onDoubleClick={() => {
                if (!isAggregate) onEnter(station.id);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") activate();
              }}
              onMouseEnter={() => onHover(station.id)}
              onMouseLeave={() => onHover(null)}
            >
              {isPinned && (
                <path
                  d={PIN_PATH}
                  fill={AMBER}
                  stroke="#92400e"
                  strokeWidth={1}
                  transform={`translate(${station.x - 12 * PIN_SCALE}, ${
                    station.y - DOT_RADIUS - 1 - 21.5 * PIN_SCALE
                  }) scale(${PIN_SCALE})`}
                />
              )}
              {isAggregate ? (
                <rect
                  x={station.x - 6}
                  y={station.y - 6}
                  width={12}
                  height={12}
                  rx={2}
                  fill="white"
                  stroke={GREY}
                  strokeWidth={1.2}
                />
              ) : (
                <circle
                  cx={station.x}
                  cy={station.y}
                  r={DOT_RADIUS}
                  fill={dotFill}
                  stroke={dotStroke}
                  strokeWidth={isSelected ? 2.2 : 1.2}
                />
              )}
              {node.inGoalDomain && (
                <rect
                  x={station.x - 11}
                  y={station.y - 2.5}
                  width={5}
                  height={5}
                  fill="none"
                  stroke={AMBER}
                  strokeWidth={1}
                />
              )}
              <text x={station.x + 10} y={station.y + 4} fontSize={11} fill={TEXT}>
                {isAggregate
                  ? t("kingdom.aggregateLabel", {
                      label: truncate(node.label),
                      count: node.collapsedCount,
                    })
                  : truncate(node.label)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
