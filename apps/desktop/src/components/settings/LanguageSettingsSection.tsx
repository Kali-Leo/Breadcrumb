/**
 * Purpose: the language section of the settings page — which language the app speaks, and
 * which language the AI answers in. They are one choice for almost everyone, and two for the
 * person whose language the model writes poorly: that person keeps their own interface and
 * still gets a good explanation (spec 058 §1).
 * Main exports: LanguageSettingsSection.
 */
import {
  FALLBACK_ANSWER_LANGUAGE_CODE,
  LANGUAGES,
  languageOf,
  resolveAnswerLanguage,
  UI_LANGUAGE_CODES,
} from "@breadcrumb/core-i18n";
import { useTranslation } from "react-i18next";
import { PSEUDO_LOCALE_CODE } from "../../i18n/pseudoLocale";
import { useSettingsStore } from "../../stores/settingsStore";

const SAME_AS_INTERFACE = "";

export function LanguageSettingsSection() {
  const { t } = useTranslation("settings");
  const language = useSettingsStore((state) => state.language);
  const answerLanguage = useSettingsStore((state) => state.answerLanguage);
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const setAnswerLanguage = useSettingsStore((state) => state.setAnswerLanguage);

  const choice = resolveAnswerLanguage(language, answerLanguage);
  const fallback = languageOf(FALLBACK_ANSWER_LANGUAGE_CODE);
  const selectClass =
    "min-w-0 max-w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[15px] outline-none focus:border-amber-400 coarse:min-h-11 coarse:text-base stacked:w-full";

  return (
    <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
      <h3 className="font-medium text-stone-700">{t("language.title")}</h3>

      <label className="flex flex-wrap items-center justify-between gap-4 text-sm text-stone-500">
        {t("language.interface")}
        <select
          value={language}
          onChange={(event) => void setLanguage(event.target.value)}
          className={selectClass}
        >
          {UI_LANGUAGE_CODES.map((code) => (
            <option key={code} value={code}>
              {languageOf(code)?.endonym ?? code}
            </option>
          ))}
          {/* Layout testing only: never built into what a user installs (spec 058 §2). */}
          {import.meta.env.DEV && <option value={PSEUDO_LOCALE_CODE}>Pseudo (RTL)</option>}
        </select>
      </label>

      <label className="flex flex-wrap items-center justify-between gap-4 text-sm text-stone-500">
        {t("language.answer")}
        <select
          value={answerLanguage ?? SAME_AS_INTERFACE}
          onChange={(event) =>
            void setAnswerLanguage(
              event.target.value === SAME_AS_INTERFACE ? null : event.target.value,
            )
          }
          className={selectClass}
        >
          <option value={SAME_AS_INTERFACE}>{t("language.sameAsInterface")}</option>
          {LANGUAGES.map((entry) => (
            <option key={entry.code} value={entry.code}>
              {entry.endonym}
            </option>
          ))}
        </select>
      </label>

      {choice.worthOffering && fallback && (
        <p className="text-sm text-stone-500">
          {t("language.thinNote", {
            language: choice.interfaceLanguage.endonym,
            fallback: fallback.endonym,
          })}
        </p>
      )}
    </section>
  );
}
