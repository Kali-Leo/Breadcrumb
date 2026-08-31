/**
 * Purpose: the one place an LLM call's config is assembled — the saved service credentials,
 * the Tauri fetch, and the directive naming the language the model must answer in (spec 058
 * §1). Every call site builds its config here so no feature can quietly answer in the wrong
 * language.
 * Main exports: llmConfigFrom, currentAnswerLanguage, currentPriceCurrency.
 */
import {
  buildLanguageDirective,
  type Language,
  resolveAnswerLanguage,
} from "@breadcrumb/core-i18n";
import type { Currency, LlmClientConfig } from "@breadcrumb/core-llm";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { ApiConfig } from "../stores/settingsStore";
import { useSettingsStore } from "../stores/settingsStore";

/** The language the model is currently asked to write in — the interface language unless
 * the user pointed the answers at another one. */
export function currentAnswerLanguage(): Language {
  const { language, answerLanguage } = useSettingsStore.getState();
  return resolveAnswerLanguage(language, answerLanguage).answerLanguage;
}

/** The currency this account is billed in, for models sold in more than one. Undefined
 * leaves the choice to the price table, which is correct for every single-currency model. */
export function currentPriceCurrency(): Currency | undefined {
  return useSettingsStore.getState().apiConfig?.priceCurrency;
}

/**
 * `firm` is the second attempt after a reply came back in the wrong language: same request,
 * a harder instruction.
 */
export function llmConfigFrom(apiConfig: ApiConfig, options?: { firm?: boolean }): LlmClientConfig {
  // Named rather than spread: priceCurrency is billing bookkeeping and has no business
  // travelling to the provider with the request.
  return {
    baseUrl: apiConfig.baseUrl,
    apiKey: apiConfig.apiKey,
    model: apiConfig.model,
    fetchImpl: tauriFetch,
    answerLanguageDirective: buildLanguageDirective(currentAnswerLanguage(), options),
  };
}
