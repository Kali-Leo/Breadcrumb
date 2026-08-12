/**
 * Purpose: settings view — OpenAI-compatible API config, the global network switch,
 * and per-feature AI switches (each metered feature can be turned off independently).
 * Main exports: SettingsPanel.
 */
import { useState } from "react";
import { type FeatureSwitches, useSettingsStore } from "../stores/settingsStore";
import { DiglotSettingsSection } from "./DiglotSettingsSection";

const FEATURE_LABELS: Record<keyof FeatureSwitches, { name: string; hint: string }> = {
  knowledgeTree: {
    name: "🌳 知识树提取",
    hint: "每轮对话后额外调用一次 AI 提取知识点（独立计费）",
  },
  trail: { name: "🍞 轨迹每日总结", hint: "每天生成一句昨日学习总结（独立计费）" },
  factcheck: {
    name: "🔍 求真核查",
    hint: "在 AI 回答下方点「求证」：提取事实并检索公开资料佐证（独立计费）",
  },
  knowledgeEdges: {
    name: "🕸️ 知识关系发现",
    hint: "新知识点落库后额外调用一次 AI，判定前置/辅助关系（独立计费）",
  },
  interest: {
    name: "💡 兴趣画像",
    hint: "每轮对话后观察好奇/困惑/厌倦倾向；也用于「我学过…」自报映射（独立计费）",
  },
  labPanel: {
    name: "🧪 实验室面板",
    hint: "临时实验面板：看推荐、建目标、比路线；建目标时会额外调用一次 AI（独立计费）",
  },
  compareProfileBuild: {
    name: "🌲 对比画像构建（实验功能）",
    hint: "在对比树里按输入检索构建新画像：AI 提案后逐条核验资料来源，较耗时（独立计费）",
  },
  compareAlignment: {
    name: "🌉 对比语义对齐",
    hint: "对比树里让 AI 判定你的用词与资料用词是否同一概念；判定永久复用，只为新出现的组合花钱（独立计费）",
  },
  mapTopicNaming: {
    name: "🗺️ 板块 AI 起名（实验）",
    hint: "记忆宫殿里给聚成一堆的零散兴趣起一个领域名；同一堆只算一次，之后一直复用（独立计费）",
  },
};

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

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const apiConfig = useSettingsStore((state) => state.apiConfig);
  const networkEnabled = useSettingsStore((state) => state.networkEnabled);
  const saveApiConfig = useSettingsStore((state) => state.saveApiConfig);
  const setNetworkEnabled = useSettingsStore((state) => state.setNetworkEnabled);
  const featureSwitches = useSettingsStore((state) => state.featureSwitches);
  const setFeatureSwitch = useSettingsStore((state) => state.setFeatureSwitch);
  const mainlandNetwork = useSettingsStore((state) => state.mainlandNetwork);
  const setMainlandNetwork = useSettingsStore((state) => state.setMainlandNetwork);

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
        <Toggle
          on={networkEnabled}
          onClick={() => void setNetworkEnabled(!networkEnabled)}
          label="网络总开关"
        />
      </section>

      <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="font-medium text-stone-700">AI 功能开关</h3>
        {(Object.keys(FEATURE_LABELS) as (keyof FeatureSwitches)[]).map((feature) => (
          <div key={feature} className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-stone-700">{FEATURE_LABELS[feature].name}</p>
              <p className="text-xs text-stone-500">{FEATURE_LABELS[feature].hint}</p>
            </div>
            <Toggle
              on={featureSwitches[feature]}
              onClick={() => void setFeatureSwitch(feature, !featureSwitches[feature])}
              label={FEATURE_LABELS[feature].name}
            />
          </div>
        ))}
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
    </div>
  );
}
