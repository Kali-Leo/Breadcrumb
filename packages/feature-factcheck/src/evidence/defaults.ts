/**
 * Purpose: the evidence route — which providers run, in what order, for this edition, this
 * network, this language and these keys. Three layers, tried in order: structured facts
 * (Wikidata), encyclopaedic prose (Wikipedia), the open web (Zhipu search, keyed and paid),
 * plus the desktop's own search-engine scraping underneath. Four facts decide the route:
 *  - edition: the browser edition can only reach CORS-open endpoints, and neither search
 *    engine's HTML is one (measured); on the desktop Rust makes the request and both work.
 *  - mainland network: Wikipedia and Wikidata are unreachable there; asking would only burn
 *    a timeout in front of every fallback.
 *  - language: the open-web layer returns confident garbage for Hindi, Bengali and Arabic.
 *  - key: the open-web layer costs money and sends the query to a search engine, so it runs
 *    only when the learner has turned it on and supplied a key.
 * An empty route is a real answer, and the host must say so: the browser edition on a
 * mainland network without a key has NO source, and a check that pretends otherwise would
 * report "没找到佐证" about a world it never looked at.
 * Main exports: createDefaultEvidenceProviders, DefaultProvidersOptions, EvidenceEdition.
 */
import { createBingProvider } from "./bing";
import { createDuckDuckGoProvider } from "./duckduckgo";
import type { EvidenceProvider, FetchLike } from "./provider";
import { createWikidataProvider } from "./wikidata";
import type { FactRenderer } from "./wikidataRender";
import { wikiEditionOf } from "./wikimedia";
import { createWikipediaProvider } from "./wikipedia";
import { createZhipuSearchProvider, zhipuSupportsLanguage } from "./zhipu";

/** Who makes the HTTP request: Rust (desktop) or the page itself (browser). */
export type EvidenceEdition = "desktop" | "browser";

export interface DefaultProvidersOptions {
  fetchImpl: FetchLike;
  edition: EvidenceEdition;
  /** True on a mainland-China network, where the Wikimedia endpoints are unreachable. */
  mainlandChina: boolean;
  /** The learner's language, a UI language code: picks the Wikipedia edition, the Wikidata
   * label chain, and whether the open-web layer is trusted for this script. */
  language: string;
  /** Zhipu search key. Absent or empty = the open-web layer is off. Never read from anywhere
   * but the learner's own settings. */
  webSearchApiKey?: string | null;
  /** How a Wikidata fact is rendered into a sentence in the learner's language. */
  renderFact?: FactRenderer;
  timeoutMs?: number;
}

/** Wikipedia editions to try: the learner's own, then English — the low-resource editions
 * (Swahili: 126k articles) cannot be the only place looked. */
function wikipediaEditions(language: string): string[] {
  const own = wikiEditionOf(language);
  return own === null || own === "en" ? ["en"] : [own, "en"];
}

export function createDefaultEvidenceProviders(
  options: DefaultProvidersOptions,
): EvidenceProvider[] {
  const shared = { fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs };
  const providers: EvidenceProvider[] = [];

  if (!options.mainlandChina) {
    providers.push(
      createWikidataProvider({
        ...shared,
        language: options.language,
        renderFact: options.renderFact,
      }),
      createWikipediaProvider({ ...shared, languages: wikipediaEditions(options.language) }),
    );
  }

  const key = options.webSearchApiKey?.trim() ?? "";
  if (key.length > 0 && zhipuSupportsLanguage(options.language)) {
    providers.push(
      createZhipuSearchProvider({ ...shared, apiKey: key, language: options.language }),
    );
  }

  if (options.edition === "desktop") {
    providers.push(createBingProvider(shared));
    if (!options.mainlandChina) providers.push(createDuckDuckGoProvider(shared));
  }

  return providers;
}
