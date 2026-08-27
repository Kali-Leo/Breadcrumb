/**
 * Purpose: the one place an LLM call's config is assembled — the saved service credentials,
 * the Tauri fetch, and the directive naming the language the model must answer in (spec 058
 * §1). Every call site builds its config here so no feature can quietly answer in the wrong
 * language.
 * Main exports: llmConfigFrom, currentAnswerLanguage.
 */
import {
  buildLanguageDirective,
  type Language,
  resolveAnswerLanguage,
} from "@breadcrumb/core-i18n";
import type { LlmClientConfig } from "@breadcrumb/core-llm";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { ApiConfig } from "../stores/settingsStore";
import { useSettingsStore } from "../stores/settingsStore";

/** The language the model is currently asked to write in — the interface language unless
 * the user pointed the answers at another one. */
export function currentAnswerLanguage(): Language {
  const { language, answerLanguage } = useSettingsStore.getState();
  return resolveAnswerLanguage(language, answerLanguage).answerLanguage;
}

/**
 * `firm` is the second attempt after a reply came back in the wrong language: same request,
 * a harder instruction.
 */
export function llmConfigFrom(apiConfig: ApiConfig, options?: { firm?: boolean }): LlmClientConfig {
  return {
    ...apiConfig,
    fetchImpl: tauriFetch,
    answerLanguageDirective: buildLanguageDirective(currentAnswerLanguage(), options),
  };
}
