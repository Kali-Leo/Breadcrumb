/**
 * Purpose: settings view with three pages — general (API config, language, network,
 * mainland mode), switches-and-spending (the per-feature billing page, Leo 2026-08-12), and
 * research (the research task platform, moved here from the top level by spec 044).
 * Main exports: SettingsPanel.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../stores/settingsStore";
import { BillingSettingsPanel } from "./BillingSettingsPanel";
import { BackArrow } from "./DirectionalArrow";
import { LanguageSettingsSection } from "./LanguageSettingsSection";
import { ResearchPanel } from "./ResearchPanel";
import { SettingsQuietIssues } from "./SettingsQuietIssues";
// The same switch every settings row uses; this page carried its own copy of it until now.
import { Toggle } from "./SettingsToggle";

interface SettingsPanelProps {
  onClose(): void;
}

type SettingsPage = "general" | "billing" | "research";

const PAGE_TABS: readonly SettingsPage[] = ["general", "billing", "research"];

/** The API form's unsaved edits, module-level so switching views (which unmounts this
 * panel) does not silently discard them — they come back on the next visit until saved
 * (Leo-approved 2026-08-16: keep the 保存 button, never lose typed text). */
let apiFormDraft: { baseUrl: string; apiKey: string; model: string } | null = null;

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { t } = useTranslation(["settings", "common", "chat"]);
  const apiConfig = useSettingsStore((state) => state.apiConfig);
  const networkEnabled = useSettingsStore((state) => state.networkEnabled);
  const saveApiConfig = useSettingsStore((state) => state.saveApiConfig);
  const setNetworkEnabled = useSettingsStore((state) => state.setNetworkEnabled);
  const mainlandNetwork = useSettingsStore((state) => state.mainlandNetwork);
  const setMainlandNetwork = useSettingsStore((state) => state.setMainlandNetwork);

  const [page, setPage] = useState<SettingsPage>("general");
  const savedBaseUrl = apiConfig?.baseUrl ?? "https://api.deepseek.com/v1";
  const savedApiKey = apiConfig?.apiKey ?? "";
  const savedModel = apiConfig?.model ?? "deepseek-v4-flash";
  const [baseUrl, setBaseUrl] = useState(apiFormDraft?.baseUrl ?? savedBaseUrl);
  const [apiKey, setApiKey] = useState(apiFormDraft?.apiKey ?? savedApiKey);
  const [model, setModel] = useState(apiFormDraft?.model ?? savedModel);
  const [savedHint, setSavedHint] = useState(false);

  const dirty = baseUrl !== savedBaseUrl || apiKey !== savedApiKey || model !== savedModel;

  function editBaseUrl(value: string): void {
    setBaseUrl(value);
    apiFormDraft = { baseUrl: value, apiKey, model };
  }
  function editApiKey(value: string): void {
    setApiKey(value);
    apiFormDraft = { baseUrl, apiKey: value, model };
  }
  function editModel(value: string): void {
    setModel(value);
    apiFormDraft = { baseUrl, apiKey, model: value };
  }

  async function save() {
    await saveApiConfig({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() });
    apiFormDraft = null;
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
        <h2 className="text-lg font-semibold text-stone-700">{t("title")}</h2>
        {PAGE_TABS.map((target) => (
          <button
            key={target}
            type="button"
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
          <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="font-medium text-stone-700">{t("api.title")}</h3>
            <p className="text-sm text-stone-500">{t("api.hint")}</p>
            <label className="block space-y-1 text-sm text-stone-500">
              {t("api.baseUrl")}
              <input
                value={baseUrl}
                onChange={(e) => editBaseUrl(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block space-y-1 text-sm text-stone-500">
              {t("api.apiKey")}
              <input
                type="password"
                value={apiKey}
                onChange={(e) => editApiKey(e.target.value)}
                placeholder="sk-…"
                className={inputClass}
              />
            </label>
            <label className="block space-y-1 text-sm text-stone-500">
              {t("api.model")}
              <input
                value={model}
                onChange={(e) => editModel(e.target.value)}
                className={inputClass}
              />
            </label>
            <button
              type="button"
              onClick={() => void save()}
              className="rounded-xl bg-amber-500 px-4 py-2 text-white transition-colors hover:bg-amber-600"
            >
              {t("common:actions.save")}
            </button>
            {savedHint && <span className="ms-3 text-sm text-amber-600">{t("api.saved")}</span>}
            {!savedHint && dirty && (
              <span className="ms-3 text-sm text-stone-400">{t("api.unsaved")}</span>
            )}
          </section>

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

          <SettingsQuietIssues />
        </>
      )}

      <p className="text-center text-[11px] text-stone-300">{t("chat:companion.credits")}</p>
    </div>
  );
}
