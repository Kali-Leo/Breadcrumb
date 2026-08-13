/**
 * Purpose: the dedicated switches-and-billing settings page (Leo 2026-08-12) — every
 * token-consuming feature in one place: its switch, what it does, and its real spend
 * (today / all time, from llm_calls). Metering exists so features can run boldly.
 * Main exports: BillingSettingsPanel.
 */
import { formatCost } from "@breadcrumb/core-llm";
import { useEffect, useState } from "react";
import { getRepos } from "../lib/db";
import { todayLocalMidnightIso } from "../lib/time";
import { useDiglotStore } from "../stores/diglotStore";
import { type FeatureSwitches, useSettingsStore } from "../stores/settingsStore";
import { ResearchTasksSettingsRow } from "./ResearchTasksSettingsRow";
import { Toggle } from "./SettingsToggle";

/** Switchable metered features: switch key → display copy and metering purposes. */
const FEATURE_ROWS: Array<{
  feature: keyof FeatureSwitches;
  name: string;
  hint: string;
  purposes: string[];
}> = [
  {
    feature: "knowledgeTree",
    name: "🌳 知识树提取",
    hint: "每轮对话后额外调用一次 AI 提取知识点",
    purposes: ["knowledge-tree"],
  },
  {
    feature: "trail",
    name: "🍞 轨迹每日总结",
    hint: "每天生成一句昨日学习总结",
    purposes: ["trail"],
  },
  {
    feature: "factcheck",
    name: "🔍 求真核查",
    hint: "在 AI 回答下方点「求证」:提取事实并检索公开资料佐证",
    purposes: ["factcheck"],
  },
  {
    feature: "knowledgeEdges",
    name: "🕸️ 知识关系发现",
    hint: "新知识点落库后额外调用一次 AI,判定前置/辅助关系",
    purposes: ["knowledge-edges"],
  },
  {
    feature: "interest",
    name: "💡 兴趣画像",
    hint: "每轮对话后观察好奇/困惑/厌倦倾向;也用于「我学过…」自报映射",
    purposes: ["interest", "self-report-mapping"],
  },
  {
    feature: "labPanel",
    name: "🧪 实验室面板",
    hint: "临时实验面板:看推荐、建目标、比路线;建目标时会额外调用一次 AI",
    purposes: ["goal-planning"],
  },
  {
    feature: "compareProfileBuild",
    name: "🌲 对比画像构建(实验功能)",
    hint: "在对比树里按输入检索构建新画像:AI 提案后逐条核验资料来源,较耗时",
    purposes: ["compare-profile"],
  },
  {
    feature: "compareAlignment",
    name: "🌉 对比语义对齐",
    hint: "AI 判定你的用词与资料用词是否同一概念;判定永久复用,只为新组合花钱",
    purposes: ["compare-align"],
  },
  {
    feature: "teachQuality",
    name: "🎓 回讲判读",
    hint: "回讲结束后判一次讲解质量(原理级/复述级/有误),好的讲解直接成为掌握度证据",
    purposes: ["teach-quality"],
  },
  {
    feature: "mapTopicNaming",
    name: "🗺️ 板块 AI 起名(实验)",
    hint: "记忆宫殿里给聚成一堆的零散兴趣起领域名;同一堆只算一次",
    purposes: ["map-naming"],
  },
  {
    feature: "feedbackLab",
    name: "🪞 反馈实验室",
    hint: "反馈形式试验场:全部由本地数据计算,零 token",
    purposes: [],
  },
  {
    feature: "companionChat",
    name: "🎭 伙伴会话",
    hint: "侧边栏三位 AI 学习伙伴:打开对话、主动发起回讲提议",
    purposes: ["companion-chat"],
  },
  {
    feature: "companionMemory",
    name: "🧠 伙伴记忆",
    hint: "伙伴对话轮次结束后记一条观察,累计到阈值再归纳一次洞察",
    purposes: ["companion-memory"],
  },
  {
    feature: "companionScript",
    name: "📜 回讲脚本",
    hint: "接受回讲提议时先生成脚本(期望点/预置误解),回讲中每轮做一次状态合并",
    purposes: ["companion-script"],
  },
];

/** "今日 X · 累计 Y" for a purpose set; empty string while loading or when never used. */
function spendLine(
  today: Map<string, string>,
  total: Map<string, string>,
  purposes: string[],
): string {
  const todayText = purposes.map((p) => today.get(p)).find((v) => v !== undefined);
  const totalText = purposes.map((p) => total.get(p)).find((v) => v !== undefined);
  if (todayText === undefined && totalText === undefined) return "尚未产生费用";
  return `今日 ${todayText ?? "0"} · 累计 ${totalText ?? "0"}`;
}

function useSpendMaps(): { today: Map<string, string>; total: Map<string, string> } {
  const [today, setToday] = useState(new Map<string, string>());
  const [total, setTotal] = useState(new Map<string, string>());
  useEffect(() => {
    void (async () => {
      const repos = await getRepos();
      const toMap = (rows: Awaited<ReturnType<typeof repos.llmCalls.sumCostSinceByPurpose>>) => {
        const map = new Map<string, string>();
        for (const row of rows) {
          // A purpose is normally single-currency; join defensively if not.
          const formatted = formatCost(row.total_micros ?? 0, row.currency);
          map.set(
            row.purpose,
            map.has(row.purpose) ? `${map.get(row.purpose)}+${formatted}` : formatted,
          );
        }
        return map;
      };
      setToday(toMap(await repos.llmCalls.sumCostSinceByPurpose(todayLocalMidnightIso())));
      setTotal(toMap(await repos.llmCalls.sumCostSinceByPurpose("1970-01-01T00:00:00.000Z")));
    })();
  }, []);
  return { today, total };
}

export function BillingSettingsPanel() {
  const featureSwitches = useSettingsStore((state) => state.featureSwitches);
  const setFeatureSwitch = useSettingsStore((state) => state.setFeatureSwitch);
  const diglotSettings = useDiglotStore((state) => state.settings);
  const saveDiglotSettings = useDiglotStore((state) => state.saveSettings);
  const { today, total } = useSpendMaps();

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-500">
        每个会花钱的环节在这里独立开关、独立看账。放心打开——花了多少,这一页永远说实话。
      </p>
      <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
        {FEATURE_ROWS.map((row) => (
          <div key={row.feature} className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-stone-700">{row.name}</p>
              <p className="text-xs text-stone-500">{row.hint}</p>
              <p className="text-xs text-stone-400">{spendLine(today, total, row.purposes)}</p>
            </div>
            <Toggle
              on={featureSwitches[row.feature]}
              onClick={() => void setFeatureSwitch(row.feature, !featureSwitches[row.feature])}
              label={row.name}
            />
          </div>
        ))}
        <ResearchTasksSettingsRow />
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-stone-700">🧵 织入·智能替换</p>
            <p className="text-xs text-stone-500">
              语言织入的进阶层:多义词按语境选译,并织入短语级地道表达(基础织入零费用,此层每条消息一次小调用)
            </p>
            <p className="text-xs text-stone-400">{spendLine(today, total, ["diglot-weave"])}</p>
          </div>
          <Toggle
            on={diglotSettings.llmRefineEnabled}
            onClick={() =>
              void saveDiglotSettings({ llmRefineEnabled: !diglotSettings.llmRefineEnabled })
            }
            label="织入智能替换"
          />
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-stone-100 pt-3">
          <div>
            <p className="text-sm text-stone-700">💬 对话本体</p>
            <p className="text-xs text-stone-500">核心功能,无开关;账目照记</p>
            <p className="text-xs text-stone-400">{spendLine(today, total, ["chat"])}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
