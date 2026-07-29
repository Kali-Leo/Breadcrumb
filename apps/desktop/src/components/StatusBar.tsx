/**
 * Purpose: bottom status bar — network state, current model, conversation & today cost;
 * hovering today's cost reveals the per-feature breakdown (chat / knowledge-tree / trail).
 * Main exports: StatusBar.
 */
import { formatCost } from "@breadcrumb/core-llm";
import { useEffect, useState } from "react";
import { getRepos } from "../lib/db";
import { todayLocalMidnightIso } from "../lib/time";
import type { CostByCurrency } from "../stores/chatStore";
import { useChatStore } from "../stores/chatStore";
import { useSettingsStore } from "../stores/settingsStore";

const PURPOSE_NAMES: Record<string, string> = {
  chat: "对话",
  "knowledge-tree": "知识树",
  trail: "轨迹总结",
};

function renderCost(cost: CostByCurrency): string {
  if (cost.size === 0) return "¥0.0000";
  return [...cost.entries()].map(([currency, micros]) => formatCost(micros, currency)).join(" + ");
}

/** e.g. "对话 $0.0021 · 知识树 $0.0004" — refreshed whenever today's total changes. */
function usePurposeBreakdown(todayCost: CostByCurrency): string {
  const [breakdown, setBreakdown] = useState("");
  // biome-ignore lint/correctness/useExhaustiveDependencies: todayCost is the refresh trigger, not a body dependency
  useEffect(() => {
    void (async () => {
      const repos = await getRepos();
      const rows = await repos.llmCalls.sumCostSinceByPurpose(todayLocalMidnightIso());
      setBreakdown(
        rows
          .map(
            (row) =>
              `${PURPOSE_NAMES[row.purpose] ?? row.purpose} ${formatCost(row.total_micros ?? 0, row.currency)}`,
          )
          .join(" · "),
      );
    })();
  }, [todayCost]);
  return breakdown;
}

export function StatusBar() {
  const networkEnabled = useSettingsStore((state) => state.networkEnabled);
  const apiConfig = useSettingsStore((state) => state.apiConfig);
  const conversationCost = useChatStore((state) => state.conversationCost);
  const todayCost = useChatStore((state) => state.todayCost);
  const breakdown = usePurposeBreakdown(todayCost);

  return (
    <footer className="flex items-center gap-4 border-t border-stone-200 bg-white px-4 py-1.5 text-xs text-stone-500">
      <span>{networkEnabled ? "🌐 联网" : "🔌 离线"}</span>
      <span>{apiConfig ? apiConfig.model : "未配置模型"}</span>
      <span className="ml-auto">本次对话 {renderCost(conversationCost)}</span>
      <span title={breakdown} className="cursor-help">
        今日 {renderCost(todayCost)}
      </span>
    </footer>
  );
}
