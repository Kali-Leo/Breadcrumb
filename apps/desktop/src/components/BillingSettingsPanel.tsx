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
    name: "🌳 知识整理",
    hint: "每次对话结束后，AI 会把这次聊到的知识点整理进你的地图。每轮一次调用。",
    purposes: ["knowledge-tree"],
  },
  {
    feature: "factcheck",
    name: "🔍 事实核查",
    hint: "在 AI 回答下方点「求证」，AI 会去公开资料里查证回答中的说法。",
    purposes: ["factcheck"],
  },
  {
    feature: "knowledgeEdges",
    name: "🕸️ 知识关联",
    hint: "记下新知识点后，AI 会看看它和你学过的内容有什么联系。每次一小笔。",
    purposes: ["knowledge-edges"],
  },
  {
    feature: "interest",
    name: "💡 个性化推荐",
    hint: "AI 会留意你对哪些内容感兴趣、哪里有困惑，用来调整推荐；你说「我学过…」时也靠它来识别对应的知识点。",
    purposes: ["interest", "self-report-mapping"],
  },
  {
    feature: "goalPlanning",
    name: "🎯 目标规划",
    hint: "你定下一个目标后，AI 会把它变成一份要学的清单；建目标时用一次。",
    purposes: ["goal-planning"],
  },
  {
    feature: "compareProfileBuild",
    name: "🌲 对比资料构建（实验）",
    hint: "想对比职业名录之外的主题时，AI 会检索公开资料整理出一份对照清单，并逐条核对来源；需要几分钟。",
    purposes: ["compare-profile"],
  },
  {
    feature: "compareAlignment",
    name: "🌉 对比匹配",
    hint: "对比时，AI 会判断你的说法和资料里的说法是不是同一个概念；同样的一对只判断一次。",
    purposes: ["compare-align"],
  },
  {
    feature: "teachQuality",
    name: "🎓 讲解反馈",
    hint: "你讲给伙伴听之后，AI 会看一遍你讲得怎么样；讲得清楚的部分会被记下来。",
    purposes: ["teach-quality"],
  },
  {
    feature: "mapTopicNaming",
    name: "🗺️ 地图起名（实验）",
    hint: "在记忆宫殿里，AI 会给自动聚在一起的一片内容起名字；每片只起一次。",
    purposes: ["map-naming"],
  },
  {
    feature: "feedbackLab",
    name: "🪞 这段时间",
    hint: "记忆宫殿右栏的回顾内容:全部由本地数据算出,不花钱",
    purposes: [],
  },
  {
    feature: "companionChat",
    name: "🎭 伙伴聊天",
    hint: "三位 AI 学习伙伴:打开对话、偶尔主动邀请你讲给它听或一起回顾",
    purposes: ["companion-chat"],
  },
  {
    feature: "companionMemory",
    name: "🧠 伙伴记忆",
    hint: "伙伴会记住和你聊过的内容;偶尔整理一次,让记忆更连贯",
    purposes: ["companion-memory"],
  },
  {
    feature: "companionScript",
    name: "📜 伙伴预习",
    hint: "你开讲之前，要听你讲的伙伴会先预习一下这个主题，听的时候更能接上话；你讲的过程中每轮一小笔。",
    purposes: ["companion-script"],
  },
  {
    feature: "focusExplain",
    name: "🔎 专注解释",
    hint: "在专注模式里选中词语或提问时，AI 会生成一段讲解；每个词讲一次。",
    purposes: ["focus-explain"],
  },
  {
    feature: "termMarking",
    name: "🖊️ 生词标注",
    hint: "AI 会在每条回答里标出你可能还不认识的词，点一下就能看解释；每条只标一次。",
    purposes: ["term-marking"],
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

/** All purposes summed per currency, formatted — "" when nothing was ever spent. */
function grandTotalOf(
  rows: Array<{ currency: "USD" | "CNY"; total_micros: number | null }>,
): string {
  const microsByCurrency = new Map<"USD" | "CNY", number>();
  for (const row of rows) {
    microsByCurrency.set(
      row.currency,
      (microsByCurrency.get(row.currency) ?? 0) + (row.total_micros ?? 0),
    );
  }
  return [...microsByCurrency.entries()]
    .map(([currency, micros]) => formatCost(micros, currency))
    .join(" + ");
}

function useSpendMaps(): {
  today: Map<string, string>;
  total: Map<string, string>;
  todayGrandTotal: string;
  allTimeGrandTotal: string;
} {
  const [today, setToday] = useState(new Map<string, string>());
  const [total, setTotal] = useState(new Map<string, string>());
  const [todayGrandTotal, setTodayGrandTotal] = useState("");
  const [allTimeGrandTotal, setAllTimeGrandTotal] = useState("");
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
      const todayRows = await repos.llmCalls.sumCostSinceByPurpose(todayLocalMidnightIso());
      const allRows = await repos.llmCalls.sumCostSinceByPurpose("1970-01-01T00:00:00.000Z");
      setToday(toMap(todayRows));
      setTotal(toMap(allRows));
      setTodayGrandTotal(grandTotalOf(todayRows));
      setAllTimeGrandTotal(grandTotalOf(allRows));
    })();
  }, []);
  return { today, total, todayGrandTotal, allTimeGrandTotal };
}

export function BillingSettingsPanel() {
  const featureSwitches = useSettingsStore((state) => state.featureSwitches);
  const setFeatureSwitch = useSettingsStore((state) => state.setFeatureSwitch);
  const diglotSettings = useDiglotStore((state) => state.settings);
  const saveDiglotSettings = useDiglotStore((state) => state.saveSettings);
  const { today, total, todayGrandTotal, allTimeGrandTotal } = useSpendMaps();

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-500">
        每个会花钱的环节在这里独立开关、独立看账。放心打开——花了多少,这一页永远说实话。
      </p>
      <p className="text-sm text-stone-600">
        今日合计 {todayGrandTotal === "" ? "还没花钱" : todayGrandTotal} · 累计{" "}
        {allTimeGrandTotal === "" ? "还没花钱" : allTimeGrandTotal}
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
            <p className="text-sm text-stone-700">🧵 语言学习·智能替换</p>
            <p className="text-xs text-stone-500">
              语言学习的加强版：AI
              按上下文挑更准确的译法，偶尔换上一句地道短语。每条消息一次小额调用。
            </p>
            <p className="text-xs text-stone-400">{spendLine(today, total, ["diglot-weave"])}</p>
          </div>
          <Toggle
            on={diglotSettings.llmRefineEnabled}
            onClick={() =>
              void saveDiglotSettings({ llmRefineEnabled: !diglotSettings.llmRefineEnabled })
            }
            label="语言学习智能替换"
          />
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-stone-100 pt-3">
          <div>
            <p className="text-sm text-stone-700">💬 聊天</p>
            <p className="text-xs text-stone-500">
              和 AI 的日常对话。这是核心功能，一直开启；花费同样记在这里。
            </p>
            <p className="text-xs text-stone-400">{spendLine(today, total, ["chat"])}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
