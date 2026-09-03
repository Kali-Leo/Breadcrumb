/**
 * Purpose: the very first screen for someone whose machine reads a language this app has no
 * interface in — they pick one instead of the app guessing for them (Leo 2026-09-01:
 * "认不出来先让用户选语言"). Deliberately wordless: every language is written in itself, which
 * is the one thing a reader of any of them can recognize, and any sentence here would have to
 * be written in a language we have just admitted we do not know they read.
 * Main exports: LanguageFirstRun.
 */
import { languageOf, UI_LANGUAGE_CODES } from "@breadcrumb/core-i18n";
import { useSettingsStore } from "../../stores/settingsStore";

export function LanguageFirstRun() {
  const setLanguage = useSettingsStore((state) => state.setLanguage);

  return (
    <div className="flex h-dvh items-center justify-center bg-stone-50 p-8">
      <div className="w-full max-w-md space-y-2">
        {UI_LANGUAGE_CODES.map((code) => {
          const language = languageOf(code);
          return (
            <button
              key={code}
              type="button"
              lang={code}
              dir={language?.direction ?? "ltr"}
              onClick={() => void setLanguage(code)}
              className="w-full rounded-2xl border border-stone-200 bg-white px-5 py-4 text-start text-[17px] text-stone-700 shadow-sm hover:border-amber-400"
            >
              {language?.endonym ?? code}
            </button>
          );
        })}
      </div>
    </div>
  );
}
