/**
 * Purpose: the comparison tree's SVG rendering (spec 023, ADR-0016) — d3-hierarchy tidy
 * layout over the currently-expanded nodes, horizontal node-link form, Breadcrumb styling:
 * amber depth = overlap ratio, the ratio printed on every node, stone curved links, CSS
 * transforms transitioned so expand/collapse glides instead of jumping.
 * Main exports: CompareTreeView.
 */
import type { OverlapNode } from "@breadcrumb/plugin-compare";
import { hierarchy, tree } from "d3-hierarchy";
import { useMemo } from "react";

const NODE_WIDTH = 168;
const NODE_HEIGHT = 34;
const LEVEL_GAP = 216;
const ROW_GAP = 44;
const PADDING = 16;

interface LayoutDatum {
  node: OverlapNode | null; // null only for the synthetic root
  hasHiddenChildren: boolean;
}

interface LayoutEntry {
  datum: LayoutDatum;
  children?: LayoutEntry[];
}

/** White→amber-500 wash: 0% overlap is nearly paper, 100% is a confident amber. */
function fillFor(ratio: number): string {
  return `rgba(245, 158, 11, ${0.06 + 0.5 * ratio})`;
}

function percentOf(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export function CompareTreeView({
  roots,
  expandedKeys,
  detailKey,
  onToggle,
  onSelectDetail,
}: {
  roots: readonly OverlapNode[];
  expandedKeys: ReadonlySet<string>;
  detailKey: string | null;
  onToggle(key: string): void;
  onSelectDetail(key: string): void;
}) {
  const layout = useMemo(() => {
    // Only expanded nodes contribute children — the layout IS the collapse mechanism.
    function toEntry(node: OverlapNode): LayoutEntry {
      const expanded = expandedKeys.has(node.key);
      return {
        datum: { node, hasHiddenChildren: !expanded && node.children.length > 0 },
        children: expanded ? node.children.map(toEntry) : undefined,
      };
    }
    const syntheticRoot: LayoutEntry = {
      datum: { node: null, hasHiddenChildren: false },
      children: roots.map(toEntry),
    };
    const root = hierarchy<LayoutEntry>(syntheticRoot, (entry) => entry.children);
    tree<LayoutEntry>().nodeSize([ROW_GAP, LEVEL_GAP])(root);
    const visible = root.descendants().filter((point) => point.data.datum.node !== null);
    const minX = Math.min(...visible.map((point) => point.x ?? 0));
    const maxX = Math.max(...visible.map((point) => point.x ?? 0));
    const maxY = Math.max(...visible.map((point) => point.y ?? 0));
    return { root, visible, minX, maxX, maxY };
  }, [roots, expandedKeys]);

  // Synthetic root sits at depth 0 / y 0; real depth-1 nodes start at x offset −minX.
  const width = layout.maxY - LEVEL_GAP + NODE_WIDTH + PADDING * 2;
  const height = layout.maxX - layout.minX + NODE_HEIGHT + PADDING * 2;
  const offsetX = -layout.minX + PADDING;

  return (
    <div className="overflow-auto rounded border border-stone-200 bg-white">
      <svg
        width={Math.max(width, 320)}
        height={Math.max(height, 80)}
        role="img"
        aria-label="对比树"
      >
        {layout.visible.map((point) => {
          const parent = point.parent;
          if (parent === null || parent.data.datum.node === null) return null;
          const x1 = (parent.y ?? 0) - LEVEL_GAP + NODE_WIDTH;
          const y1 = (parent.x ?? 0) + offsetX + NODE_HEIGHT / 2;
          const x2 = (point.y ?? 0) - LEVEL_GAP;
          const y2 = (point.x ?? 0) + offsetX + NODE_HEIGHT / 2;
          const mid = (x1 + x2) / 2;
          return (
            <path
              key={`link-${point.data.datum.node?.key}`}
              d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke="#d6d3d1"
              strokeWidth={1.2}
              style={{ transition: "all 0.25s ease" }}
            />
          );
        })}
        {layout.visible.map((point) => {
          const node = point.data.datum.node as OverlapNode;
          const x = (point.y ?? 0) - LEVEL_GAP;
          const y = (point.x ?? 0) + offsetX;
          const selected = node.key === detailKey;
          return (
            // biome-ignore lint/a11y/useSemanticElements: SVG nodes cannot be <button> elements
            <g
              key={node.key}
              role="button"
              tabIndex={0}
              aria-label={`${node.label} 重合 ${percentOf(node.ratio)}`}
              style={{
                transform: `translate(${x}px, ${y}px)`,
                transition: "transform 0.25s ease",
                cursor: "pointer",
              }}
              onClick={() => {
                onSelectDetail(node.key);
                if (!node.isLeaf) onToggle(node.key);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  onSelectDetail(node.key);
                  if (!node.isLeaf) onToggle(node.key);
                }
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
              </text>
              <text
                x={NODE_WIDTH - 10}
                y={21}
                fontSize={11}
                fill="#78716c"
                textAnchor="end"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {percentOf(node.ratio)}
                {point.data.datum.hasHiddenChildren ? " ▸" : ""}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
