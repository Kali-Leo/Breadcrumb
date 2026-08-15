/**
 * Purpose: settings view with three pages — 通用 (API config, network, diglot core,
 * mainland mode), 开关与计价 (the per-feature billing page, Leo 2026-08-12), and 研究课题
 * (the research task platform, moved here from the top level by spec 044).
 * Main exports: SettingsPanel.
 */
import { useState } from "react";
import { COMPANION_DESKTOP_COPY } from "../lib/companionActions";
import { useSettingsStore } from "../stores/settingsStore";
import { BillingSettingsPanel } from "./BillingSettingsPanel";
import { DiglotSettingsSection } from "./DiglotSettingsSection";
import { ResearchPanel } from "./ResearchPanel";

function Toggle({ on, onClick, label }: { on: boolean; onClick(): void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`h-7 w-13 shrink-0 rounded-full p-0.5 transition-colors ${on ? "bg-amber-500" : "bg-stone-300"}`}
    >
      <span
        className={`block h-6 w-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-6" : "translate-x-0"}`}
      />
    </button>
  );
}

interface SettingsPanelProps {
  onClose(): void;
}

type SettingsPage = "general" | "billing" | "research";

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const apiConfig = useSettingsStore((state) => state.apiConfig);
  const networkEnabled = useSettingsStore((state) => state.networkEnabled);
  const saveApiConfig = useSettingsStore((state) => state.saveApiConfig);
  const setNetworkEnabled = useSettingsStore((state) => state.setNetworkEnabled);
  const mainlandNetwork = useSettingsStore((state) => state.mainlandNetwork);
  const setMainlandNetwork = useSettingsStore((state) => state.setMainlandNetwork);

  const [page, setPage] = useState<SettingsPage>("general");
  const [baseUrl, setBaseUrl] = useState(apiConfig?.baseUrl ?? "https://api.deepseek.com/v1");
  const [apiKey, setApiKey] = useState(apiConfig?.apiKey ?? "");
  const [model, setModel] = useState(apiConfig?.model ?? "deepseek-v4-flash");
  const [savedHint, setSavedHint] = useState(false);

  async function save() {
    await saveApiConfig({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() });
    setSavedHint(true);
    setTimeout(() => setSavedHint(false), 2000);
  }

  const inputClass =
    "w-full rounded-xl border border-stone-200 px-3 py-2 text-[15px] outline-none focus:border-amber-400";
  const tabClass = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm ${active ? "bg-amber-100 text-stone-700" : "text-stone-500 hover:bg-stone-100"}`;

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto bg-stone-50 p-6">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-stone-700">设置</h2>
        <button
          type="button"
          onClick={() => setPage("general")}
          className={tabClass(page === "general")}
        >
          通用
        </button>
        <button
          type="button"
          onClick={() => setPage("billing")}
          className={tabClass(page === "billing")}
        >
          开关与计价
        </button>
        <button
          type="button"
          onClick={() => setPage("research")}
          className={tabClass(page === "research")}
        >
          研究课题
        </button>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-lg px-3 py-1.5 text-sm text-stone-500 hover:bg-stone-100"
        >
          ← 返回对话
        </button>
      </div>

      {page === "billing" && <BillingSettingsPanel />}
      {page === "research" && <ResearchPanel />}

      {page === "general" && (
        <>
          <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="font-medium text-stone-700">AI 服务（OpenAI 兼容）</h3>
            <label className="block space-y-1 text-sm text-stone-500">
              服务地址 Base URL
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block space-y-1 text-sm text-stone-500">
              API Key
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-…"
                className={inputClass}
              />
            </label>
            <label className="block space-y-1 text-sm text-stone-500">
              模型名
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className={inputClass}
              />
            </label>
            <button
              type="button"
              onClick={() => void save()}
              className="rounded-xl bg-amber-500 px-4 py-2 text-white transition-colors hover:bg-amber-600"
            >
              保存
            </button>
            {savedHint && <span className="ml-3 text-sm text-amber-600">已保存 ✓</span>}
          </section>

          <section className="flex items-center justify-between rounded-2xl bg-white p-5 shadow-sm">
            <div>
              <h3 className="font-medium text-stone-700">网络总开关</h3>
              <p className="text-sm text-stone-500">
                关闭后，所有需要联网的功能（包括 API 调用）都会安静地停下。
              </p>
            </div>
            <Toggle
              on={networkEnabled}
              onClick={() => void setNetworkEnabled(!networkEnabled)}
              label="网络总开关"
            />
          </section>

          <DiglotSettingsSection />

          <section className="flex items-center justify-between rounded-2xl bg-white p-5 shadow-sm">
            <div>
              <h3 className="font-medium text-stone-700">大陆网络模式</h3>
              <p className="text-sm text-stone-500">
                求真核查只使用大陆可访问的资料源（必应）；关闭后优先维基百科。
              </p>
            </div>
            <Toggle
              on={mainlandNetwork}
              onClick={() => void setMainlandNetwork(!mainlandNetwork)}
              label="大陆网络模式"
            />
          </section>
        </>
      )}

      <p className="text-center text-[11px] text-stone-300">{COMPANION_DESKTOP_COPY.credits}</p>
    </div>
  );
}
