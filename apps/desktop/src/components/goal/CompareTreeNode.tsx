/**
 * Purpose: one node of the comparison tree — the amber-washed box whose depth is the
 * overlap ratio, the ratio printed on it, and the ▸ marker for a branch with children still
 * folded away. Activation both selects the node and toggles its children.
 * Main exports: CompareTreeNode.
 */
import type { OverlapNode } from "@breadcrumb/feature-compare";
import { useTranslation } from "react-i18next";
import { fillFor, NODE_HEIGHT, NODE_WIDTH, percentOf } from "./compareTreeLayout";

export function CompareTreeNode({
  node,
  x,
  y,
  selected,
  hasHiddenChildren,
  onActivate,
}: {
  node: OverlapNode;
  x: number;
  y: number;
  selected: boolean;
  hasHiddenChildren: boolean;
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
