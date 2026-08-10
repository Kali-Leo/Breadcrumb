/**
 * Purpose: the comparison tree's SVG rendering (spec 023, ADR-0016) — d3-hierarchy tidy
 * layout starting from ONE visible root (the profile itself, so the tree reads as a tree,
 * not a list), amber depth = overlap ratio with the ratio printed on every node, drag-to-pan
 * on the whole canvas, and auto-focus scrolling that glides the newly expanded children into
 * view. Main exports: CompareTreeView.
 */
import type { OverlapNode } from "@breadcrumb/plugin-compare";
import { hierarchy, tree } from "d3-hierarchy";
import { useEffect, useMemo, useRef, useState } from "react";

const NODE_WIDTH = 168;
const NODE_HEIGHT = 34;
const LEVEL_GAP = 216;
const ROW_GAP = 44;
const PADDING = 16;
/** Pointer travel below this is a click on whatever is under the cursor, not a pan. */
const DRAG_THRESHOLD_PX = 5;

interface LayoutEntry {
  node: OverlapNode;
  hasHiddenChildren: boolean;
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
  root,
  expandedKeys,
  detailKey,
  onToggle,
  onSelectDetail,
}: {
  root: OverlapNode;
  expandedKeys: ReadonlySet<string>;
  detailKey: string | null;
  onToggle(key: string): void;
  onSelectDetail(key: string): void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const layout = useMemo(() => {
    // Only expanded nodes contribute children — the layout IS the collapse mechanism.
    function toEntry(node: OverlapNode): LayoutEntry {
      const expanded = expandedKeys.has(node.key);
      return {
        node,
        hasHiddenChildren: !expanded && node.children.length > 0,
        children: expanded ? node.children.map(toEntry) : undefined,
      };
    }
    const rootEntry = hierarchy<LayoutEntry>(toEntry(root), (entry) => entry.children);
    tree<LayoutEntry>().nodeSize([ROW_GAP, LEVEL_GAP])(rootEntry);
    const visible = rootEntry.descendants();
    const minX = Math.min(...visible.map((point) => point.x ?? 0));
    const maxX = Math.max(...visible.map((point) => point.x ?? 0));
    const maxY = Math.max(...visible.map((point) => point.y ?? 0));
    return { visible, minX, maxX, maxY };
  }, [root, expandedKeys]);

  const width = layout.maxY + NODE_WIDTH + PADDING * 2;
  const height = layout.maxX - layout.minX + NODE_HEIGHT + PADDING * 2;
  const offsetY = -layout.minX + PADDING;

  // Glide the freshly expanded node (and thus its children column) into view.
  useEffect(() => {
    const container = containerRef.current;
    if (focusKey === null || container === null) return;
    const point = layout.visible.find((candidate) => candidate.data.node.key === focusKey);
    if (point === undefined) return;
    container.scrollTo({
      left: Math.max(0, (point.y ?? 0) + PADDING - container.clientWidth / 3),
      top: Math.max(0, (point.x ?? 0) + offsetY + NODE_HEIGHT / 2 - container.clientHeight / 2),
      behavior: "smooth",
    });
  }, [layout, focusKey, offsetY]);

  function handleNodeActivate(node: OverlapNode) {
    if (suppressClickRef.current) return;
    onSelectDetail(node.key);
    if (node.children.length > 0) {
      onToggle(node.key);
      setFocusKey(node.key);
    }
  }

  return (
    <div
      ref={containerRef}
      className="overflow-auto rounded border border-stone-200 bg-white"
      style={{
        maxHeight: 420,
        cursor: dragRef.current?.moved ? "grabbing" : "grab",
        userSelect: "none",
      }}
      onPointerDown={(event) => {
        const container = containerRef.current;
        if (container === null) return;
        dragRef.current = {
          x: event.clientX,
          y: event.clientY,
          left: container.scrollLeft,
          top: container.scrollTop,
          moved: false,
        };
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        const container = containerRef.current;
        if (drag === null || container === null) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (!drag.moved && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD_PX) return;
        drag.moved = true;
        container.scrollLeft = drag.left - dx;
        container.scrollTop = drag.top - dy;
      }}
      onPointerUp={() => {
        suppressClickRef.current = dragRef.current?.moved ?? false;
        dragRef.current = null;
        // Let the click event (which fires right after pointerup) see the flag, then clear.
        setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      }}
      onPointerLeave={() => {
        dragRef.current = null;
      }}
    >
      <svg
        width={Math.max(width, 320)}
        height={Math.max(height, 80)}
        role="img"
        aria-label="对比树"
      >
        {layout.visible.map((point) => {
          const parent = point.parent;
          if (parent === null) return null;
          const x1 = (parent.y ?? 0) + PADDING + NODE_WIDTH;
          const y1 = (parent.x ?? 0) + offsetY + NODE_HEIGHT / 2;
          const x2 = (point.y ?? 0) + PADDING;
          const y2 = (point.x ?? 0) + offsetY + NODE_HEIGHT / 2;
          const mid = (x1 + x2) / 2;
          return (
            <path
              key={`link-${point.data.node.key}`}
              d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke="#d6d3d1"
              strokeWidth={1.2}
              style={{ transition: "all 0.25s ease" }}
            />
          );
        })}
        {layout.visible.map((point) => {
          const node = point.data.node;
          const x = (point.y ?? 0) + PADDING;
          const y = (point.x ?? 0) + offsetY;
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
              onClick={() => handleNodeActivate(node)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") handleNodeActivate(node);
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
                {point.data.hasHiddenChildren ? " ▸" : ""}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
