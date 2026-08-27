/**
 * Purpose: one focus session's subway map (spec 042 §4) — every station and link always drawn
 * (nothing hides), the current line amber, the rest grey; clicking a station jumps to it. Owns
 * its own pane: width grows with the map (capped so it never crowds the content pane), the svg
 * scales down to fit before the pane resorts to scrolling, and the current station scrolls into
 * view on every jump. Visual vocabulary matches the old station map's (dot r5, current ring,
 * dashed = 3 3), spec 040's provenance-tree view that spec 042 §6 retired.
 * Main exports: FocusMap.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { layoutFocusMap } from "../lib/focusMapLayout";
import { useFocusStore } from "../stores/focusStore";

const DOT_RADIUS = 5;
const LABEL_MAX_CHARS = 12;
const ACTIVE_COLOR = "#f59e0b";
const INACTIVE_DOT_COLOR = "#78716c";
const INACTIVE_LINE_COLOR = "#d6d3d1";

const PANE_MIN_WIDTH = 256;
/** The map pane must not crowd out the content pane (Leo) — 45% of the overlay is its ceiling,
 * enforced via CSS max-width since the overlay's own pixel width isn't measured here. */
const PANE_MAX_WIDTH_PERCENT = "45%";
/** Breathing room around the map's natural size before the pane needs to shrink or scroll. */
const PANE_PADDING = 32;
/** Below this the map stops shrinking and the pane scrolls instead — a station this small
 * stops being clickable. */
const MIN_SCALE = 0.6;

function truncateLabel(label: string): string {
  return label.length > LABEL_MAX_CHARS ? `${label.slice(0, LABEL_MAX_CHARS)}…` : label;
}

function activateOnKey(event: React.KeyboardEvent, action: () => void) {
  if (event.key === "Enter" || event.key === " ") action();
}

/** Tracks one element's rendered content-box size (spec 042 §4's "先缩放" fit calculation needs
 * the pane's actual pixels, which CSS alone doesn't expose to JS). */
function useElementSize<T extends HTMLElement>(): [
  React.RefObject<T | null>,
  { width: number; height: number },
] {
  const ref = useRef<T>(null);
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

export function FocusMap() {
  const { t } = useTranslation(["learning", "common"]);
  const nodes = useFocusStore((state) => state.nodes);
  const currentNodeId = useFocusStore((state) => state.currentNodeId);
  const jumpTo = useFocusStore((state) => state.jumpTo);

  const [paneRef, paneSize] = useElementSize<HTMLDivElement>();

  const layout = layoutFocusMap(
    nodes.map((node) => ({
      id: node.id,
      label: node.label,
      kind: node.kind,
      parentId: node.parent_id,
    })),
    currentNodeId,
  );

  // paneRef is a stable ref object; only the current station id should retrigger this scroll.
  // biome-ignore lint/correctness/useExhaustiveDependencies: paneRef.current is read, not the ref itself
  useEffect(() => {
    const container = paneRef.current;
    const target = container?.querySelector('[data-current-station="true"]');
    target?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [currentNodeId]);

  if (layout.stations.length === 0) return null;

  // Fit-to-pane before falling back to scrolling: shrink (never grow) the natural size down to
  // whichever dimension is tighter, with a floor past which the pane scrolls instead.
  const fitScale =
    paneSize.width > 0 && paneSize.height > 0
      ? Math.min(paneSize.width / layout.width, paneSize.height / layout.height, 1)
      : 1;
  const scale = Math.max(MIN_SCALE, fitScale);
  const paneWidth = Math.max(PANE_MIN_WIDTH, layout.width + PANE_PADDING);

  return (
    <aside
      style={{ width: `${paneWidth}px`, maxWidth: PANE_MAX_WIDTH_PERCENT }}
      className="flex shrink-0 flex-col border-stone-200 border-l"
    >
      <div ref={paneRef} className="flex-1 overflow-auto p-3">
        <svg
          width={layout.width * scale}
          height={layout.height * scale}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          role="img"
          aria-label="专注站点图"
        >
          {layout.links.map((link) => (
            <polyline
              key={link.points.map((point) => `${point.x},${point.y}`).join("-")}
              points={link.points.map((point) => `${point.x},${point.y}`).join(" ")}
              fill="none"
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
                  data-current-station={station.isCurrent ? "true" : undefined}
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
      </div>
      <p className="shrink-0 border-stone-200 border-t px-3 py-2 text-[11px] text-stone-400">
        {t("learning:focus.mapHint")}
      </p>
    </aside>
  );
}
