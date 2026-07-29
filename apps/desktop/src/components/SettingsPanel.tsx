/**
 * Purpose: settings view — OpenAI-compatible API config and the global network switch.
 * Main exports: SettingsPanel.
 */
import { useState } from "react";
import { useSettingsStore } from "../stores/settingsStore";

interface SettingsPanelProps {
  onClose(): void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const apiConfig = useSettingsStore((state) => state.apiConfig);
  const networkEnabled = useSettingsStore((state) => state.networkEnabled);
  const saveApiConfig = useSettingsStore((state) => state.saveApiConfig);
  const setNetworkEnabled = useSettingsStore((state) => state.setNetworkEnabled);

  const [baseUrl, setBaseUrl] = useState(apiConfig?.baseUrl ?? "https://api.deepseek.com/v1");
  const [apiKey, setApiKey] = useState(apiConfig?.apiKey ?? "");
  const [model, setModel] = useState(apiConfig?.model ?? "deepseek-chat");
  const [savedHint, setSavedHint] = useState(false);

  async function save() {
    await saveApiConfig({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() });
    setSavedHint(true);
    setTimeout(() => setSavedHint(false), 2000);
  }

  const inputClass =
    "w-full rounded-xl border border-stone-200 px-3 py-2 text-[15px] outline-none focus:border-amber-400";

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto bg-stone-50 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-stone-700">设置</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-sm text-stone-500 hover:bg-stone-100"
        >
          ← 返回对话
        </button>
      </div>

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
          <input value={model} onChange={(e) => setModel(e.target.value)} className={inputClass} />
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
        <button
          type="button"
          onClick={() => void setNetworkEnabled(!networkEnabled)}
          className={`h-7 w-13 rounded-full p-0.5 transition-colors ${networkEnabled ? "bg-amber-500" : "bg-stone-300"}`}
          aria-label="网络总开关"
        >
          <span
            className={`block h-6 w-6 rounded-full bg-white shadow transition-transform ${networkEnabled ? "translate-x-6" : "translate-x-0"}`}
          />
        </button>
      </section>
    </div>
  );
}
