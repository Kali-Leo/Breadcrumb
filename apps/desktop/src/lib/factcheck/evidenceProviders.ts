/**
 * Purpose: the one place the fact check's evidence route is assembled from the learner's
 * settings — which edition this is, whether the network is a mainland one, which language
 * the learner reads, and whether they turned the paid open-web layer on and gave it a key.
 * The route itself is decided in feature-factcheck (evidence/defaults.ts); this file only
 * reads the settings and supplies the two things a headless package cannot: the platform
 * fetch, and the catalogue sentence a Wikidata fact is rendered into.
 *
 * The rendered sentence goes through asStoredText: t() wraps interpolated values in bidi
 * isolates, which are right on screen and would make the judge's verbatim quote fail the
 * anchor gate (the gate strips whitespace, not invisible isolates).
 * Main exports: currentEvidenceProviders, wikidataFactRenderer.
 */
import {
  createDefaultEvidenceProviders,
  type EvidenceProvider,
  type FactRenderer,
} from "@breadcrumb/feature-factcheck";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import i18next from "i18next";
import { asStoredText } from "../../i18n/storedText";
import type { SettingsState } from "../../stores/settingsStore";
import { isBrowserEdition } from "../platform/edition";
import { currentAnswerLanguage } from "../platform/llmConfig";

/** A Wikidata fact as one sentence in the answer language — the sentence the judge will be
 * asked to copy, so it is written in the language the learner reads. */
export const wikidataFactRenderer: FactRenderer = (parts) =>
  asStoredText(
    parts.reference === null
      ? i18next.t("chat:factcheck.wikidataFact", {
          subject: parts.subject,
          property: parts.property,
          value: parts.value,
        })
      : i18next.t("chat:factcheck.wikidataFactWithReference", {
          subject: parts.subject,
          property: parts.property,
          value: parts.value,
          reference: parts.reference,
        }),
  );

/**
 * The providers a check should run with right now. An empty list is a real answer — the
 * browser edition on a mainland network with no search key has no source at all — and the
 * caller says so instead of running a check that would report "没找到" about nothing.
 */
export function currentEvidenceProviders(
  settings: Pick<SettingsState, "mainlandNetwork" | "featureSwitches" | "webSearchApiKey">,
): EvidenceProvider[] {
  return createDefaultEvidenceProviders({
    fetchImpl: tauriFetch,
    edition: isBrowserEdition() ? "browser" : "desktop",
    mainlandChina: settings.mainlandNetwork,
    language: currentAnswerLanguage().code,
    // The key is read only behind the switch: turning the layer off must be enough, without
    // also having to clear the box.
    webSearchApiKey: settings.featureSwitches.factcheckWebSearch ? settings.webSearchApiKey : null,
    renderFact: wikidataFactRenderer,
  });
}
