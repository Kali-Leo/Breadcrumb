/**
 * Purpose: the two curves of the interest dashboard — what the platforms put in front of the
 * user (投喂) against what the user opened (选择), scored from +2 to -2. Geometry comes from
 * the module; this file only draws it and follows the cursor.
 *
 * A finger has no cursor to follow, so on a touch screen the reading is pinned by a tap
 * instead: tap the chart to read the nearest day, tap the same spot or anywhere outside to
 * put it away. Nothing on a pointer screen changes.
 * Main exports: InterestEmotionPanel.
 */

import { formatDayMonth, formatSignedDecimal } from "@breadcrumb/core-i18n";
import {
  buildEmotionChart,
  type EmotionCategory,
  type EmotionSeriesKey,
  findNearestChartPoint,
} from "@breadcrumb/feature-browsing-interest";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useInputMode } from "../../lib/platform/inputMode";
import { useBrowsingInterestStore } from "../../stores/browsingInterestStore";
import { InterestPanel, InterestPanelEmptyLine, InterestSegmentedControl } from "./InterestPanel";

const CATEGORY_VALUES = ["all", "pro", "ent", "gent"] as const satisfies readonly EmotionCategory[];

const LINE_COLOR: Record<EmotionSeriesKey, string> = {
  expose: "#eb6834",
  engage: "#2a78d6",
};

interface HoverState {
  left: number;
  top: number;
  text: string;
}

/** A tapped reading sits above the fingertip instead of beside the pointer, or the hand
 * covers the very thing it just asked for. */
const TOUCH_LIFT_PX = 34;

export function InterestEmotionPanel() {
  const { t, i18n } = useTranslation("discovery");
  const series = useBrowsingInterestStore((state) => state.emotion);
  const category = useBrowsingInterestStore((state) => state.emotionCategory);
  const setCategory = useBrowsingInterestStore((state) => state.setEmotionCategory);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const coarse = useInputMode() === "coarse";

  const chart = useMemo(() => (series ? buildEmotionChart(series) : null), [series]);

  // A reading pinned by a tap stays until it is dismissed, so tapping anywhere else on the
  // page has to be one of the ways out.
  useEffect(() => {
    if (!coarse || hover === null) return undefined;
    const close = (event: PointerEvent) => {
      if (svgRef.current?.contains(event.target as Node) !== true) setHover(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [coarse, hover]);

  function readingAt(event: React.MouseEvent<SVGSVGElement>): HoverState | null {
    if (!chart || !svgRef.current) return null;
    const box = svgRef.current.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * chart.width;
    const y = ((event.clientY - box.top) / box.height) * chart.height;
    const nearest = findNearestChartPoint(chart, x, y);
    if (!nearest) return null;
    return {
      left: event.clientX - box.left + (coarse ? 0 : 12),
      top: event.clientY - box.top - (coarse ? TOUCH_LIFT_PX : 8),
      text: t("emotion.tooltip", {
        date: formatDayMonth(i18n.language, new Date(nearest.point.day * 1000)),
        line: t(`emotion.${nearest.key}`),
        value: formatSignedDecimal(i18n.language, nearest.point.valence),
        count: nearest.point.n,
      }),
    };
  }

  function trackCursor(event: React.MouseEvent<SVGSVGElement>) {
    setHover(readingAt(event));
  }

  /** Tap: pin the nearest day's reading, or put away the one already showing here. */
  function tapChart(event: React.MouseEvent<SVGSVGElement>) {
    const next = readingAt(event);
    setHover((current) => (current !== null && current.text === next?.text ? null : next));
  }

  return (
    <InterestPanel
      title={t("emotion.title")}
      controls={
        <>
          <InterestSegmentedControl
            options={CATEGORY_VALUES.map((value) => ({ value, label: t(`emotion.${value}`) }))}
            value={category}
            onChange={(next) => void setCategory(next)}
          />
          <div className="ms-auto flex gap-4 text-stone-500 text-xs">
            {(["expose", "engage"] as const).map((key) => (
              <span key={key} className="flex items-center gap-1.5">
                <i
                  aria-hidden
                  className="inline-block h-1 w-4 rounded-full"
                  style={{ background: LINE_COLOR[key] }}
                />
                {t(`emotion.${key}`)}
              </span>
            ))}
          </div>
        </>
      }
    >
      {!chart || chart.isEmpty ? (
        <InterestPanelEmptyLine>{t("emotion.empty")}</InterestPanelEmptyLine>
      ) : (
        <div className="relative">
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: the tap reading is the pointer's
              equivalent of hovering, and there is nothing discrete here for a key to land on
              — the chart is one <svg role="img"> whose label already states what it shows. */}
          <svg
            ref={svgRef}
            width="100%"
            height={chart.height}
            viewBox={`0 0 ${chart.width} ${chart.height}`}
            role="img"
            aria-label={t("emotion.chartAria")}
            onMouseMove={coarse ? undefined : trackCursor}
            onMouseLeave={coarse ? undefined : () => setHover(null)}
            onClick={coarse ? tapChart : undefined}
          >
            <title>{t("emotion.chartAria")}</title>
            {chart.gridLines.map((line) => (
              <g key={line.value}>
                <line
                  x1={26}
                  x2={806}
                  y1={line.y}
                  y2={line.y}
                  stroke={line.isBaseline ? "#dcdbd6" : "#f1f0ec"}
                />
                <text x={4} y={line.y + 3} className="fill-stone-400 text-[10px]">
                  {line.label}
                </text>
              </g>
            ))}
            <text x={26} y={chart.height - 4} className="fill-stone-400 text-[10px]">
              {chart.firstDay === null
                ? ""
                : formatDayMonth(i18n.language, new Date(chart.firstDay * 1000))}
            </text>
            <text x={790} y={chart.height - 4} className="fill-stone-400 text-[10px]">
              {chart.lastDay === null
                ? ""
                : formatDayMonth(i18n.language, new Date(chart.lastDay * 1000))}
            </text>
            {chart.lines.map((line) => (
              <g key={line.key}>
                <path
                  d={line.path}
                  fill="none"
                  stroke={LINE_COLOR[line.key]}
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
                {line.labelAnchor && (
                  <text
                    x={line.labelAnchor.x}
                    y={line.labelAnchor.y}
                    className="font-semibold text-[10px]"
                    style={{ fill: LINE_COLOR[line.key] }}
                  >
                    {t(`emotion.${line.key}`)}
                  </text>
                )}
              </g>
            ))}
          </svg>
          {hover && (
            <div
              className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg bg-stone-800/90 px-2 py-1 text-[11px] text-white"
              style={{ left: hover.left, top: hover.top }}
            >
              {hover.text}
            </div>
          )}
        </div>
      )}
    </InterestPanel>
  );
}
