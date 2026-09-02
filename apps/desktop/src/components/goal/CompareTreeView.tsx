/**
 * Purpose: the comparison tree's SVG rendering (spec 023, ADR-0016) — d3-hierarchy tidy
 * layout starting from ONE visible root (the profile itself, so the tree reads as a tree,
 * not a list), amber depth = overlap ratio with the ratio printed on every node, drag-to-pan
 * on the whole canvas, and auto-focus scrolling that glides the newly expanded children into
 * view. Layout math lives in compareTreeLayout.ts, panning in useDragPan, one box in
 * CompareTreeNode. Main exports: CompareTreeView.
 */
import type { OverlapNode } from "@breadcrumb/feature-compare";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CompareTreeNode } from "./CompareTreeNode";
import {
  buildCompareTreeLayout,
  type CompareTreePoint,
  NODE_HEIGHT,
  NODE_WIDTH,
  PADDING,
} from "./compareTreeLayout";
import { useDragPan } from "./useDragPan";

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
  const { t } = useTranslation("palace");
  const { containerRef, dragRef, suppressClickRef, handlers } = useDragPan();
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const layout = useMemo(() => buildCompareTreeLayout(root, expandedKeys), [root, expandedKeys]);

  const width = layout.maxY + NODE_WIDTH + PADDING * 2;
  const height = layout.maxX - layout.minX + NODE_HEIGHT + PADDING * 2;
  const offsetY = -layout.minX + PADDING;

  // Enter animation (spec 026: 平滑而非闪现): a node absent from the previous layout starts
  // at its parent's position for one frame, then transitions to its real spot — children
  // visually slide out of the node that revealed them.
  const knownKeysRef = useRef<Set<string>>(new Set());
  const [bornOverrides, setBornOverrides] = useState<ReadonlyMap<string, { x: number; y: number }>>(
    new Map(),
  );
  useEffect(() => {
    const known = knownKeysRef.current;
    const overrides = new Map<string, { x: number; y: number }>();
    for (const point of layout.visible) {
      const key = point.data.node.key;
      if (known.has(key) || point.parent === null) continue;
      overrides.set(key, { x: point.parent.y ?? 0, y: point.parent.x ?? 0 });
    }
    knownKeysRef.current = new Set(layout.visible.map((point) => point.data.node.key));
    if (overrides.size === 0) {
      // A cancelled clear (StrictMode double-effect, rapid layout changes) must never
      // leave stale overrides behind — that renders the whole tree piled on its parents
      // ("一团" at the root). Clear defensively on every no-newborn pass.
      setBornOverrides((previous) => (previous.size === 0 ? previous : new Map()));
      return undefined;
    }
    setBornOverrides(overrides);
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => setBornOverrides(new Map()));
    });
    // Belt and braces: even if both animation frames die (cancelled cleanup, hidden
    // tab), the timeout still snaps nodes to their real positions.
    const fallback = setTimeout(() => setBornOverrides(new Map()), 120);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(fallback);
    };
  }, [layout]);

  /** Effective drawing position: newborn nodes render at their parent for the first frame. */
  function positionOf(point: CompareTreePoint): { x: number; y: number } {
    const override = bornOverrides.get(point.data.node.key);
    return override === undefined
      ? { x: point.y ?? 0, y: point.x ?? 0 }
      : { x: override.x, y: override.y };
  }

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
  }, [layout, focusKey, offsetY, containerRef]);

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
        // WebKitGTK (Tauri Linux) ignores the unprefixed property — without the prefix a
        // drag turns into app-wide text selection instead of panning.
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
      onPointerDown={handlers.onPointerDown}
      onPointerMove={handlers.onPointerMove}
      onPointerUp={handlers.onPointerUp}
      onPointerLeave={handlers.onPointerLeave}
    >
      <svg
        width={Math.max(width, 320)}
        height={Math.max(height, 80)}
        role="img"
        aria-label={t("compare.treeAria")}
      >
        {layout.visible.map((point) => {
          const parent = point.parent;
          if (parent === null) return null;
          const parentPosition = positionOf(parent);
          const ownPosition = positionOf(point);
          const x1 = parentPosition.x + PADDING + NODE_WIDTH;
          const y1 = parentPosition.y + offsetY + NODE_HEIGHT / 2;
          const x2 = ownPosition.x + PADDING;
          const y2 = ownPosition.y + offsetY + NODE_HEIGHT / 2;
          const mid = (x1 + x2) / 2;
          return (
            <path
              key={`link-${point.data.node.key}`}
              d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke="#d6d3d1"
              strokeWidth={1.2}
              // Path shape can't CSS-transition, so newborn links fade in instead of popping.
              style={{
                opacity: bornOverrides.has(point.data.node.key) ? 0 : 1,
                transition: "opacity 0.3s ease",
              }}
            />
          );
        })}
        {layout.visible.map((point) => {
          const node = point.data.node;
          const position = positionOf(point);
          return (
            <CompareTreeNode
              key={node.key}
              node={node}
              x={position.x + PADDING}
              y={position.y + offsetY}
              selected={node.key === detailKey}
              hasHiddenChildren={point.data.hasHiddenChildren}
              onActivate={handleNodeActivate}
            />
          );
        })}
      </svg>
    </div>
  );
}
