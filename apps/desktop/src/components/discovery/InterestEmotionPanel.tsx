/**
 * Purpose: the two curves of the interest dashboard — what the platforms put in front of the
 * user (投喂) against what the user opened (选择), scored from +2 to -2. Geometry comes from
 * the plugin; this file only draws it and follows the cursor.
 * Main exports: InterestEmotionPanel.
 */
import {
  buildEmotionChart,
  type EmotionCategory,
  type EmotionSeriesKey,
  findNearestChartPoint,
  formatDayLabel,
} from "@breadcrumb/plugin-browsing-interest";
import { useMemo, useRef, useState } from "react";
import { useBrowsingInterestStore } from "../../stores/browsingInterestStore";
import { InterestPanel, InterestPanelEmptyLine, InterestSegmentedControl } from "./InterestPanel";

const CATEGORIES = [
  { value: "all", label: "全部" },
  { value: "pro", label: "专业" },
  { value: "ent", label: "娱乐" },
  { value: "gent", label: "精选娱乐" },
] as const satisfies readonly { value: EmotionCategory; label: string }[];

const LINE_STYLE: Record<EmotionSeriesKey, { color: string; label: string }> = {
  expose: { color: "#eb6834", label: "投喂" },
  engage: { color: "#2a78d6", label: "选择" },
};

interface HoverState {
  left: number;
  top: number;
  text: string;
}

export function InterestEmotionPanel() {
  const series = useBrowsingInterestStore((state) => state.emotion);
  const category = useBrowsingInterestStore((state) => state.emotionCategory);
  const setCategory = useBrowsingInterestStore((state) => state.setEmotionCategory);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);

  const chart = useMemo(() => (series ? buildEmotionChart(series) : null), [series]);

  function trackCursor(event: React.MouseEvent<SVGSVGElement>) {
    if (!chart || !svgRef.current) return;
    const box = svgRef.current.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * chart.width;
    const y = ((event.clientY - box.top) / box.height) * chart.height;
    const nearest = findNearestChartPoint(chart, x, y);
    if (!nearest) {
      setHover(null);
      return;
    }
    const valence = nearest.point.valence;
    setHover({
      left: event.clientX - box.left + 12,
      top: event.clientY - box.top - 8,
      text: `${formatDayLabel(nearest.point.day)} ${LINE_STYLE[nearest.key].label} ${
        valence > 0 ? "+" : ""
      }${valence.toFixed(2)}（${nearest.point.n} 条）`,
    });
  }

  return (
    <InterestPanel
      title="内容情绪"
      controls={
        <>
          <InterestSegmentedControl
            options={CATEGORIES}
            value={category}
            onChange={(next) => void setCategory(next)}
          />
          <div className="ml-auto flex gap-4 text-stone-500 text-xs">
            {(["expose", "engage"] as const).map((key) => (
              <span key={key} className="flex items-center gap-1.5">
                <i
                  aria-hidden
                  className="inline-block h-1 w-4 rounded-full"
                  style={{ background: LINE_STYLE[key].color }}
                />
                {LINE_STYLE[key].label}
              </span>
            ))}
          </div>
        </>
      }
    >
      {!chart || chart.isEmpty ? (
        <InterestPanelEmptyLine>这段时间还没有记下内容</InterestPanelEmptyLine>
      ) : (
        <div className="relative">
          <svg
            ref={svgRef}
            width="100%"
            height={chart.height}
            viewBox={`0 0 ${chart.width} ${chart.height}`}
            role="img"
            aria-label="投喂与选择的内容情绪曲线"
            onMouseMove={trackCursor}
            onMouseLeave={() => setHover(null)}
          >
            <title>投喂与选择的内容情绪曲线</title>
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
              {chart.firstDayLabel}
            </text>
            <text x={790} y={chart.height - 4} className="fill-stone-400 text-[10px]">
              {chart.lastDayLabel}
            </text>
            {chart.lines.map((line) => (
              <g key={line.key}>
                <path
                  d={line.path}
                  fill="none"
                  stroke={LINE_STYLE[line.key].color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
                {line.labelAnchor && (
                  <text
                    x={line.labelAnchor.x}
                    y={line.labelAnchor.y}
                    className="font-semibold text-[10px]"
                    style={{ fill: LINE_STYLE[line.key].color }}
                  >
                    {LINE_STYLE[line.key].label}
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
