/**
 * Purpose: one station of the kingdom's subway map — a minimal neutral state mark (done
 * filled, visited outlined amber, untouched outlined grey, an aggregate as a counted box),
 * the recommendation pin, the goal-domain tick, and the label. Click selects (or expands an
 * aggregate), double-click enters (Leo 2026-08-31 #3). Under a finger the dot is 10px and
 * there is no double-click to speak of, so a transparent hit disc widens the target and a
 * second tap on the already-selected station enters — the same two-step grammar as the
 * world map's islands; the hover readout stays a mouse thing (a tap's synthetic mouseenter
 * would otherwise stick until the next tap somewhere else).
 * Main exports: KingdomTreeStation.
 */
import { useTranslation } from "react-i18next";
import type { VisibleTreeNode } from "../../../lib/map/kingdomCollapse";
import { truncate } from "../../../lib/platform/truncateText";
import { AMBER, DOT_RADIUS, GREY, LABEL_MAX_CHARS, TEXT } from "./kingdomTreeStyle";

/** Google Material Icons "place" (Apache-2.0) — same official asset as the world map's
 * recommendation pins, so "recommended here" reads as one symbol everywhere. 24×24 viewBox,
 * tip at (12, ~21.5). */
const PIN_PATH =
  "M12 2C8.13 2 5 5.13 5 8.5c0 5.25 7 13 7 13s7-7.75 7-13C19 5.13 15.87 2 12 2zm0 9.5c-1.66 " +
  "0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z";
const PIN_SCALE = 0.75;

export function KingdomTreeStation({
  node,
  x,
  y,
  isPinned,
  isSelected,
  touchHitRadius,
  onSelect,
  onEnter,
  onHover,
  onExpandAggregate,
}: {
  node: VisibleTreeNode;
  x: number;
  y: number;
  isPinned: boolean;
  isSelected: boolean;
  /** Finger-driven screens only: the hit disc's radius in viewBox units (null with a mouse). */
  touchHitRadius: number | null;
  onSelect(nodeId: string): void;
  onEnter(nodeId: string): void;
  onHover(nodeId: string | null): void;
  onExpandAggregate(nodeId: string): void;
}) {
  const { t } = useTranslation("palace");
  const isAggregate = node.collapsedCount !== null;
  const touch = touchHitRadius !== null;
  const dotFill = node.state === "done" ? AMBER : "white";
  const dotStroke = node.state === "untouched" ? GREY : AMBER;
  const activate = () => (isAggregate ? onExpandAggregate(node.id) : onSelect(node.id));
  const tap = () => {
    if (touch && isSelected && !isAggregate) onEnter(node.id);
    else activate();
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: SVG nodes cannot be <button> elements
    <g
      role="button"
      tabIndex={0}
      aria-label={
        isAggregate
          ? t("kingdom.expandNode", { label: node.label })
          : t("kingdom.viewNode", { label: node.label })
      }
      data-station-id={node.id}
      style={{ cursor: "pointer" }}
      onClick={tap}
      onDoubleClick={() => {
        if (!isAggregate) onEnter(node.id);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") activate();
      }}
      onMouseEnter={touch ? undefined : () => onHover(node.id)}
      onMouseLeave={touch ? undefined : () => onHover(null)}
    >
      {touch && <circle cx={x} cy={y} r={touchHitRadius} fill="transparent" />}
      {isPinned && (
        <path
          d={PIN_PATH}
          fill={AMBER}
          stroke="#92400e"
          strokeWidth={1}
          transform={`translate(${x - 12 * PIN_SCALE}, ${
            y - DOT_RADIUS - 1 - 21.5 * PIN_SCALE
          }) scale(${PIN_SCALE})`}
        />
      )}
      {isAggregate ? (
        <rect
          x={x - 6}
          y={y - 6}
          width={12}
          height={12}
          rx={2}
          fill="white"
          stroke={GREY}
          strokeWidth={1.2}
        />
      ) : (
        <circle
          cx={x}
          cy={y}
          r={DOT_RADIUS}
          fill={dotFill}
          stroke={dotStroke}
          strokeWidth={isSelected ? 2.2 : 1.2}
        />
      )}
      {node.inGoalDomain && (
        <rect
          x={x - 11}
          y={y - 2.5}
          width={5}
          height={5}
          fill="none"
          stroke={AMBER}
          strokeWidth={1}
        />
      )}
      <text x={x + 10} y={y + 4} fontSize={11} fill={TEXT}>
        {isAggregate
          ? t("kingdom.aggregateLabel", {
              label: truncate(node.label, LABEL_MAX_CHARS),
              count: node.collapsedCount,
            })
          : truncate(node.label, LABEL_MAX_CHARS)}
      </text>
    </g>
  );
}
