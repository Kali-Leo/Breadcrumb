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
    feature: "factcheck",
    name: "🔍 求真核查",
    hint: "在 AI 回答下方点「求证」:提取事实并检索公开资料佐证",
    purposes: ["factcheck"],
  },
  {
    feature: "knowledgeEdges",
    name: "🕸️ 知识关系发现",
    hint: "记下新知识点后,看一眼它和已学内容谁帮衬谁;每次一小笔",
    purposes: ["knowledge-edges"],
  },
  {
    feature: "interest",
    name: "💡 兴趣画像",
    hint: "每轮对话后观察好奇/困惑/厌倦倾向;也用于「我学过…」自报映射",
    purposes: ["interest", "self-report-mapping"],
  },
  {
    feature: "goalPlanning",
    name: "🎯 目标规划",
    hint: "把你的目标拆解成知识点集合;建目标时调用一次 AI",
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
    name: "🎓 讲得怎么样",
    hint: "你讲给伙伴听之后,看一次讲得怎么样;讲得好会直接记为掌握的证据",
    purposes: ["teach-quality"],
  },
  {
    feature: "mapTopicNaming",
    name: "🗺️ 板块 AI 起名(实验)",
    hint: "记忆宫殿里给零散兴趣聚成的板块起名字;同一片只花一次钱",
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
    name: "🎭 伙伴会话",
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
    name: "📜 伙伴备课",
    hint: "你讲之前,听讲的伙伴先备一下课,听的时候更会接话;你讲的过程中每轮一小笔",
    purposes: ["companion-script"],
  },
  {
    feature: "focusExplain",
    name: "🔎 专注解释",
    hint: "专注模式里选词或提问,每一站生成一次讲解",
    purposes: ["focus-explain"],
  },
  {
    feature: "termMarking",
    name: "🖊️ 生词标注",
    hint: "每条回答/专注解释生成后调用一次,标出可能读不懂的词;同一条只标一次",
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
