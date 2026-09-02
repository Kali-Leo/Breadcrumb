/**
 * Purpose: settings view with three pages — general (API config, language, network,
 * mainland mode, and in the browser edition backup and restore), switches-and-spending (the
 * per-feature billing page, Leo 2026-08-12), and research (the research task platform, moved
 * here from the top level by spec 044).
 * Main exports: SettingsPanel.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settingsStore";
import { BackArrow } from "../DirectionalArrow";
import { OnboardingSettingsRow } from "../onboarding/OnboardingSettingsRow";
import { ResearchPanel } from "../research/ResearchPanel";
import { ApiSettingsSection } from "./ApiSettingsSection";
import { BillingSettingsPanel } from "./BillingSettingsPanel";
import { DataBackupSection } from "./DataBackupSection";
import { LanguageSettingsSection } from "./LanguageSettingsSection";
import { SettingsQuietIssues } from "./SettingsQuietIssues";
// The same switch every settings row uses; this page carried its own copy of it until now.
import { Toggle } from "./SettingsToggle";

interface SettingsPanelProps {
  onClose(): void;
}

type SettingsPage = "general" | "billing" | "research";

const PAGE_TABS: readonly SettingsPage[] = ["general", "billing", "research"];

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { t } = useTranslation(["settings", "common", "chat"]);
  const networkEnabled = useSettingsStore((state) => state.networkEnabled);
  const setNetworkEnabled = useSettingsStore((state) => state.setNetworkEnabled);
  const mainlandNetwork = useSettingsStore((state) => state.mainlandNetwork);
  const setMainlandNetwork = useSettingsStore((state) => state.setMainlandNetwork);

  const [page, setPage] = useState<SettingsPage>("general");

  const tabClass = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm ${active ? "bg-amber-100 text-stone-700" : "text-stone-500 hover:bg-stone-100"}`;

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto bg-stone-50 p-6">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-stone-700">{t("title")}</h2>
        {PAGE_TABS.map((target) => (
          <button
            key={target}
            type="button"
            data-tour={target === "billing" ? "billing-tab" : undefined}
            onClick={() => setPage(target)}
            className={tabClass(page === target)}
          >
            {t(`tabs.${target}` as const)}
          </button>
        ))}
        <button
          type="button"
          onClick={onClose}
          className="ms-auto rounded-lg px-3 py-1.5 text-sm text-stone-500 hover:bg-stone-100"
        >
          <BackArrow /> {t("back")}
        </button>
      </div>

      {page === "billing" && <BillingSettingsPanel />}
      {page === "research" && <ResearchPanel />}

      {page === "general" && (
        <>
          <ApiSettingsSection />

          <section className="flex items-center justify-between rounded-2xl bg-white p-5 shadow-sm">
            <div>
              <h3 className="font-medium text-stone-700">{t("network.title")}</h3>
              <p className="text-sm text-stone-500">{t("network.hint")}</p>
            </div>
            <Toggle
              on={networkEnabled}
              onClick={() => void setNetworkEnabled(!networkEnabled)}
              label={t("network.title")}
            />
          </section>

          <section className="flex items-center justify-between rounded-2xl bg-white p-5 shadow-sm">
            <div>
              <h3 className="font-medium text-stone-700">{t("mainland.title")}</h3>
              <p className="text-sm text-stone-500">{t("mainland.hint")}</p>
            </div>
            <Toggle
              on={mainlandNetwork}
              onClick={() => void setMainlandNetwork(!mainlandNetwork)}
              label={t("mainland.title")}
            />
          </section>

          <LanguageSettingsSection />

          <OnboardingSettingsRow />

          {/* Browser edition only, and it renders nothing on the desktop: there the database
              is a file the learner already has. */}
          <DataBackupSection />

          <SettingsQuietIssues />
        </>
      )}

      <p className="text-center text-[11px] text-stone-300">{t("chat:companion.credits")}</p>
    </div>
  );
}
