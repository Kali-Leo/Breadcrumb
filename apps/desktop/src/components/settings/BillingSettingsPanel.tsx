/**
 * Purpose: the dedicated switches-and-billing settings page (Leo 2026-08-12) — every
 * token-consuming feature in one place: its switch, what it does, and its real spend
 * (today / all time, from llm_calls). Metering exists so features can run boldly.
 * Main exports: BillingSettingsPanel.
 */
import { formatCost, MEASUREMENT_SCENARIO } from "@breadcrumb/core-llm";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getRepos } from "../../lib/platform/db";
import { todayLocalMidnightIso } from "../../lib/platform/time";
import { useDiglotStore } from "../../stores/diglotStore";
import { type FeatureSwitches, useSettingsStore } from "../../stores/settingsStore";
import { BillingEstimateLine } from "./BillingEstimateLine";
import { ResearchTasksSettingsRow } from "./ResearchTasksSettingsRow";
import { Toggle } from "./SettingsToggle";

/** Switchable metered features: switch key → metering purposes. Names and explanations
 * live in settings.json under billing.features.<switch key>. */
const FEATURE_ROWS = [
  { feature: "knowledgeTree", purposes: ["knowledge-tree"] },
  { feature: "factcheck", purposes: ["factcheck"] },
  { feature: "knowledgeEdges", purposes: ["knowledge-edges"] },
  { feature: "interest", purposes: ["interest", "self-report-mapping"] },
  { feature: "goalPlanning", purposes: ["goal-planning"] },
  { feature: "compareProfileBuild", purposes: ["compare-profile"] },
  { feature: "compareAlignment", purposes: ["compare-align"] },
  { feature: "teachQuality", purposes: ["teach-quality"] },
  { feature: "mapTopicNaming", purposes: ["map-naming"] },
  { feature: "feedbackLab", purposes: [] },
  { feature: "companionChat", purposes: ["companion-chat"] },
  { feature: "companionMemory", purposes: ["companion-memory"] },
  { feature: "companionScript", purposes: ["companion-script"] },
  { feature: "focusExplain", purposes: ["focus-explain"] },
  { feature: "termMarking", purposes: ["term-marking"] },
] as const satisfies ReadonlyArray<{
  feature: keyof FeatureSwitches;
  purposes: readonly string[];
}>;

/** "Today X · all time Y" for a purpose set, in the reader's language. */
function useSpendLine(): (
  today: Map<string, string>,
  total: Map<string, string>,
  purposes: readonly string[],
) => string {
  const { t } = useTranslation("settings");
  return (today, total, purposes) => {
    const todayText = purposes.map((p) => today.get(p)).find((v) => v !== undefined);
    const totalText = purposes.map((p) => total.get(p)).find((v) => v !== undefined);
    if (todayText === undefined && totalText === undefined) return t("billing.neverUsed");
    return t("billing.spendLine", { today: todayText ?? "0", total: totalText ?? "0" });
  };
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
  const { t } = useTranslation("settings");
  const spendLine = useSpendLine();
  const featureSwitches = useSettingsStore((state) => state.featureSwitches);
  const setFeatureSwitch = useSettingsStore((state) => state.setFeatureSwitch);
  const diglotSettings = useDiglotStore((state) => state.settings);
  const saveDiglotSettings = useDiglotStore((state) => state.saveSettings);
  const { today, total, todayGrandTotal, allTimeGrandTotal } = useSpendMaps();

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-500">{t("billing.intro")}</p>
      <p className="text-xs text-stone-400">
        {t("billing.estimateIntro", { scenario: MEASUREMENT_SCENARIO })}
      </p>
      <p className="text-sm text-stone-600">
        {t("billing.grandTotal", {
          today: todayGrandTotal === "" ? t("billing.nothingSpent") : todayGrandTotal,
          total: allTimeGrandTotal === "" ? t("billing.nothingSpent") : allTimeGrandTotal,
        })}
      </p>
      <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
        {FEATURE_ROWS.map((row) => {
          const name = t(`billing.features.${row.feature}.name` as const);
          return (
            <div key={row.feature} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-stone-700">{name}</p>
                <p className="text-xs text-stone-500">
                  {t(`billing.features.${row.feature}.hint` as const)}
                </p>
                <BillingEstimateLine purposes={row.purposes} />
                <p className="text-xs text-stone-400">{spendLine(today, total, row.purposes)}</p>
              </div>
              <Toggle
                on={featureSwitches[row.feature]}
                onClick={() => void setFeatureSwitch(row.feature, !featureSwitches[row.feature])}
                label={name}
              />
            </div>
          );
        })}
        <ResearchTasksSettingsRow />
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-stone-700">{t("billing.diglot.name")}</p>
            <p className="text-xs text-stone-500">{t("billing.diglot.hint")}</p>
            <BillingEstimateLine purposes={["diglot-weave"]} />
            <p className="text-xs text-stone-400">{spendLine(today, total, ["diglot-weave"])}</p>
          </div>
          <Toggle
            on={diglotSettings.llmRefineEnabled}
            onClick={() =>
              void saveDiglotSettings({ llmRefineEnabled: !diglotSettings.llmRefineEnabled })
            }
            label={t("billing.diglot.toggleLabel")}
          />
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-stone-100 pt-3">
          <div>
            <p className="text-sm text-stone-700">{t("billing.chat.name")}</p>
            <p className="text-xs text-stone-500">{t("billing.chat.hint")}</p>
            <BillingEstimateLine purposes={["chat"]} />
            <p className="text-xs text-stone-400">{spendLine(today, total, ["chat"])}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
