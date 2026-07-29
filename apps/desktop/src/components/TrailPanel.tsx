/**
 * Purpose: the trail section inside the left sidebar — yesterday's gentle summary card
 * and today's breadcrumbs (knowledge learned today, across conversations).
 * Main exports: TrailPanel.
 */
import { useTrailStore } from "../stores/trailStore";

export function TrailPanel() {
  const todayNodes = useTrailStore((state) => state.todayNodes);
  const yesterdaySummary = useTrailStore((state) => state.yesterdaySummary);

  return (
    <div className="border-t border-stone-100 px-3 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-stone-500">
        <span>🍞</span>
        <span>面包屑轨迹</span>
      </div>
      {yesterdaySummary && (
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-stone-600">
          {yesterdaySummary}
        </p>
      )}
      {todayNodes.length === 0 ? (
        <p className="px-1 text-xs text-stone-400">今天的面包屑会出现在这里</p>
      ) : (
        <ul className="space-y-1">
          {todayNodes.map((node) => (
            <li key={node.id} className="truncate px-1 text-xs text-stone-600" title={node.summary}>
              · 搞懂了「{node.label}」
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
