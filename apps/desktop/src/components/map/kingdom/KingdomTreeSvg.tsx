/**
 * Purpose: the subway-map tree rendering (spec 049, 2026-08-31 修订) — deterministic
 * tidy-tree stations with minimal neutral state marks (drawn by KingdomTreeStation),
 * lateral requires/helps edges as arrowed lines (solid/dashed), and shrink-to-fit sizing.
 * Opens centered on the primary recommendation (useKingdomTreePane). Logic lives in
 * kingdomView.ts.
 * Main exports: KingdomTreeSvg.
 */
import { layoutFocusMap } from "@breadcrumb/feature-explore";
import { useTranslation } from "react-i18next";
import type { VisibleTreeNode } from "../../../lib/map/kingdomCollapse";
import type { LateralEdgeView } from "../../../lib/map/kingdomView";
import { useInputMode } from "../../../lib/platform/inputMode";
import { KingdomTreeStation } from "./KingdomTreeStation";
import { GREY, LINE } from "./kingdomTreeStyle";
import { useKingdomTreePane } from "./useKingdomTreePane";

/** Fit-to-pane floor (same rule as the focus map): below this the pane scrolls instead —
 * stations smaller than that stop being readable or clickable. */
const MIN_SCALE = 0.55;
const PANE_PADDING = 16;
/** A fingertip's target around each station, in screen pixels (WCAG 2.5.5's 44px square). */
const TOUCH_HIT_RADIUS_PX = 22;

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
  const coarse = useInputMode() === "coarse";
  const { paneRef, size: paneSize } = useKingdomTreePane(primaryId);
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

  // shrink-0: as a flex item the svg would otherwise be squeezed below its own width and
  // the floor silently broken (0.55 became 0.32 on an upright iPad, layout B4); at its true
  // size the pane scrolls as intended.
  return (
    <div ref={paneRef} className="flex h-full w-full overflow-auto p-4">
      <svg
        className="m-auto shrink-0"
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
          return (
            <KingdomTreeStation
              key={station.id}
              node={node}
              x={station.x}
              y={station.y}
              isPinned={pinnedIds.has(station.id)}
              isSelected={station.id === selectedId}
              touchHitRadius={coarse ? TOUCH_HIT_RADIUS_PX / scale : null}
              onSelect={onSelect}
              onEnter={onEnter}
              onHover={onHover}
              onExpandAggregate={onExpandAggregate}
            />
          );
        })}
      </svg>
    </div>
  );
}
