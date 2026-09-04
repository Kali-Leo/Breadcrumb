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
 * Moves the pair onto the answer language when it no longer reads it. With nothing installed
 * for that language, language learning is switched off rather than left on top of a
 * dictionary it cannot use — the settings page then says what can be learned instead.
 */
export async function syncDiglotPairToAnswerLanguage(): Promise<void> {
  const { settings, installedPairs } = useDiglotStore.getState();
  const correction = correctPairForSourceLang({
    sourceLang: currentSourceLang(),
    currentPairId: settings.pairId,
    installedPairs,
  });
  if (!correction.changed) return;
  if (correction.pairId === null) {
    useDiglotStore.setState({ pairResetTargetLang: null });
    if (settings.enabled) await useDiglotStore.getState().saveSettings({ enabled: false });
    return;
  }
  // Only worth a sentence when the learner had it running: a pair quietly corrected under an
  // off switch is not something that happened to them.
  useDiglotStore.setState({
    pairResetTargetLang: settings.enabled ? (correction.pairId.split(":")[1] ?? null) : null,
  });
  await useDiglotStore.getState().saveSettings({ pairId: correction.pairId });
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
