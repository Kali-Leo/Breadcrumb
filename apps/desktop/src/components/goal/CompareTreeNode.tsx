/**
 * Purpose: one node of the comparison tree — the amber-washed box whose depth is the
 * overlap ratio, the ratio printed on it, and the ▸ marker for a branch with children still
 * folded away. Activation both selects the node and toggles its children.
 * Main exports: CompareTreeNode.
 */
import type { OverlapNode } from "@breadcrumb/feature-compare";
import { useTranslation } from "react-i18next";
import {
  fillFor,
  NODE_HEIGHT,
  NODE_WIDTH,
  percentOf,
  TOUCH_TARGET_HEIGHT,
} from "./compareTreeLayout";

export function CompareTreeNode({
  node,
  x,
  y,
  selected,
  hasHiddenChildren,
  coarse,
  onActivate,
}: {
  node: OverlapNode;
  x: number;
  y: number;
  selected: boolean;
  hasHiddenChildren: boolean;
  /** Touch screen: the box is padded out to a fingertip's target. */
  coarse: boolean;
  onActivate(node: OverlapNode): void;
}) {
  const { t } = useTranslation("palace");
  const notDecomposed = (node.kind === "hub" || node.kind === "tool") && node.isLeaf;
  return (
    // biome-ignore lint/a11y/useSemanticElements: SVG nodes cannot be <button> elements
    <g
      role="button"
      tabIndex={0}
      aria-label={
        notDecomposed
          ? t("compare.nodeNotDecomposed", { label: node.label })
          : t("compare.nodeOverlap", {
              label: node.label,
              percent: percentOf(node.ratio),
            })
      }
      style={{
        transform: `translate(${x}px, ${y}px)`,
        transition: "transform 0.25s ease",
        cursor: "pointer",
      }}
      onClick={() => onActivate(node)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onActivate(node);
      }}
    >
      {coarse && (
        // Invisible, and painted (so it takes the tap): fill "transparent" is a fill, fill
        // "none" would not be hit at all. It grows into the 44px gap between rows, so no two
        // nodes' targets touch and nothing on screen moves.
        <rect
          y={(NODE_HEIGHT - TOUCH_TARGET_HEIGHT) / 2}
          width={NODE_WIDTH}
          height={TOUCH_TARGET_HEIGHT}
          fill="transparent"
        />
      )}
      <rect
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        rx={8}
        fill={fillFor(node.ratio)}
        stroke={selected ? "#f59e0b" : "#e7e5e4"}
        strokeWidth={selected ? 1.6 : 1}
      />
      <text x={10} y={21} fontSize={12} fill="#44403c">
        {node.label.length > 11 ? `${node.label.slice(0, 10)}…` : node.label}
        <title>{node.label}</title>
      </text>
      <text
        x={NODE_WIDTH - 10}
        y={21}
        fontSize={11}
        fill="#78716c"
        textAnchor="end"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {notDecomposed ? t("compare.notDecomposedShort") : percentOf(node.ratio)}
        {hasHiddenChildren ? " ▸" : ""}
      </text>
    </g>
  );
}
