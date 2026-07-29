/**
 * Purpose: bottom status bar — network state, current model, conversation & today cost.
 * Main exports: StatusBar.
 */
import { formatCost } from "@breadcrumb/core-llm";
import type { CostByCurrency } from "../stores/chatStore";
import { useChatStore } from "../stores/chatStore";
import { useSettingsStore } from "../stores/settingsStore";

function renderCost(cost: CostByCurrency): string {
  if (cost.size === 0) return "¥0.0000";
  return [...cost.entries()].map(([currency, micros]) => formatCost(micros, currency)).join(" + ");
}

export function StatusBar() {
  const networkEnabled = useSettingsStore((state) => state.networkEnabled);
  const apiConfig = useSettingsStore((state) => state.apiConfig);
  const conversationCost = useChatStore((state) => state.conversationCost);
  const todayCost = useChatStore((state) => state.todayCost);

  return (
    <footer className="flex items-center gap-4 border-t border-stone-200 bg-white px-4 py-1.5 text-xs text-stone-500">
      <span>{networkEnabled ? "🌐 联网" : "🔌 离线"}</span>
      <span>{apiConfig ? apiConfig.model : "未配置模型"}</span>
      <span className="ml-auto">本次对话 {renderCost(conversationCost)}</span>
      <span>今日 {renderCost(todayCost)}</span>
    </footer>
  );
}
