/**
 * Purpose: keeps the language pair pointed at the language the AI answers in. The source half
 * of a pair is not the learner's choice (see diglotPairsForLanguage.ts) — so when the answer
 * language moves, either because it was set directly or because the interface language it
 * follows moved, the pair has to move with it or the weave goes quietly dead. Runs once when
 * the diglot settings are read and on every later answer-language change; never during a
 * render.
 * Main exports: syncDiglotPairToAnswerLanguage, wireAnswerLanguageSync.
 */
import { useDiglotStore } from "../../stores/diglotStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { correctPairForSourceLang, sourceLangForAnswer } from "./diglotPairsForLanguage";

function currentSourceLang(): string {
  const { language, answerLanguage } = useSettingsStore.getState();
  return sourceLangForAnswer(language, answerLanguage);
}

/**
 * Switches language learning off when the pair no longer reads the language the AI answers in.
 * It does not pick a replacement: which language someone learns is their decision, and it is
 * never swapped underneath them because they changed how the AI writes. The settings page
 * then shows what can be learned instead.
 */
export async function syncDiglotPairToAnswerLanguage(): Promise<void> {
  const { settings } = useDiglotStore.getState();
  const correction = correctPairForSourceLang({
    sourceLang: currentSourceLang(),
    currentPairId: settings.pairId,
  });
  if (!correction.changed) return;
  if (settings.enabled) await useDiglotStore.getState().saveSettings({ enabled: false });
}

/** Guards against double registration (StrictMode double-invokes loadFromDatabase). */
let answerLanguageSyncWired = false;

export function wireAnswerLanguageSync(): void {
  if (answerLanguageSyncWired) return;
  answerLanguageSyncWired = true;
  let previous = currentSourceLang();
  useSettingsStore.subscribe((state) => {
    const next = sourceLangForAnswer(state.language, state.answerLanguage);
    if (next === previous) return;
    previous = next;
    void syncDiglotPairToAnswerLanguage();
  });
}
