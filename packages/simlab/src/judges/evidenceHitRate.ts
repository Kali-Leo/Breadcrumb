/**
 * Purpose: the retrieval-layer measurement — for each gold claim, does each evidence layer
 * bring back a passage that contains the gold anchor verbatim (anchorKey on both sides, the
 * same reduction the anchor gate uses)? The judge bench measures what a model does with
 * evidence in hand; this measures whether evidence gets into hand at all, layer by layer,
 * against the real network. Only `supported` and `contradicted` items carry an anchor, so
 * only they are counted; `insufficient` items have nothing a passage could contain.
 *
 * Queries come from the product's own extractor by default (claim in, keyword queries out),
 * because that is what the layers are searched with in the app: a Chinese claim as written
 * («珠穆朗玛峰的海拔是 8848.86 米。») has no word boundaries for the entity lookup to work
 * with, and measuring the layers on a query shape they never see would measure nothing.
 * `--queries claim` searches the claim text as-is for a key-free, model-free baseline.
 *
 * The result shapes and the summing-up live in evidenceHitRateSummary.ts.
 * Main exports: runEvidenceHitRate, EvidenceHitRateOptions, buildLayers.
 */

import { chatJson, type LlmClientConfig } from "@breadcrumb/core-llm";
import {
  anchorKey,
  buildClaimExtractionMessages,
  claimExtractionSchema,
  createWikidataProvider,
  createWikipediaProvider,
  createZhipuSearchProvider,
  type EvidenceProvider,
  mapWithConcurrency,
  wikiEditionOf,
  zhipuSupportsLanguage,
} from "@breadcrumb/feature-factcheck";
import {
  EVIDENCE_LAYERS,
  type EvidenceHitRateResult,
  type EvidenceLayer,
  type ItemOutcome,
  type LayerOutcome,
  type LayerSummary,
  sliceTable,
  summarise,
} from "./evidenceHitRateSummary";
import { type GoldVerdictItem, loadGoldVerdicts } from "./goldVerdicts";

export {
  EVIDENCE_LAYERS,
  type EvidenceHitRateResult,
  type EvidenceLayer,
  type ItemOutcome,
  type LayerOutcome,
  type LayerSummary,
} from "./evidenceHitRateSummary";

export interface EvidenceHitRateOptions {
  /** Where the search queries come from. */
  queries: "llm" | "claim";
  /** Needed for `queries: "llm"`. */
  llmConfig?: LlmClientConfig;
  /** Zhipu search key; absent = the open-web layer is reported as skipped. */
  zhipuApiKey?: string;
  /** Items worked at once. WDQS allows five concurrent queries per IP; three leaves room. */
  concurrency?: number;
  /** Evidence items asked of each layer per query — the product asks for three per claim. */
  limitPerQuery?: number;
  /** Run only these gold item ids (a smoke run); default all anchored items. */
  onlyIds?: readonly string[];
  fetchImpl?: typeof fetch;
  /** Progress line per item, for a long live run. */
  onItem?: (done: number, total: number, id: string) => void;
}

/** The three layers as the product builds them for this language, keyed by layer name. The
 * open-web layer is absent without a key or for a language it is gated away from. */
export function buildLayers(
  lang: string,
  fetchImpl: typeof fetch,
  zhipuApiKey: string | undefined,
): Partial<Record<EvidenceLayer, EvidenceProvider>> {
  const edition = wikiEditionOf(lang) ?? "en";
  const layers: Partial<Record<EvidenceLayer, EvidenceProvider>> = {
    wikidata: createWikidataProvider({ fetchImpl, language: lang }),
    wikipedia: createWikipediaProvider({
      fetchImpl,
      languages: edition === "en" ? ["en"] : [edition, "en"],
    }),
  };
  if (zhipuApiKey !== undefined && zhipuSupportsLanguage(lang)) {
    layers.zhipu = createZhipuSearchProvider({ fetchImpl, apiKey: zhipuApiKey, language: lang });
  }
  return layers;
}

/** The product's own extractor, asked about the claim alone: the keyword queries it would
 * search with. Falls back to the claim text when the model finds nothing to extract. */
async function llmQueries(llmConfig: LlmClientConfig, claim: string): Promise<string[]> {
  const messages = buildClaimExtractionMessages("", claim);
  try {
    const { parsed } = await chatJson(llmConfig, messages, claimExtractionSchema);
    const queries = parsed.claims[0]?.queries ?? [];
    return queries.length > 0 ? queries : [claim];
  } catch {
    return [claim];
  }
}

/** The numbers in an anchor, thousands separators and inner spaces removed. */
function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,.\s]*\d|\d/g) ?? [])
    .map((n) => n.replace(/[,\s]/g, ""))
    .filter((n) => n.length > 0);
}

async function runLayer(
  provider: EvidenceProvider,
  queries: readonly string[],
  anchor: string,
  limit: number,
): Promise<LayerOutcome> {
  const started = Date.now();
  const key = anchorKey(anchor);
  const numbers = numbersIn(anchor);
  let failed = true;
  let items = 0;
  let hit = false;
  let valueHit = false;
  for (const query of queries) {
    const result = await provider.search(query, limit);
    if (!result.failed) failed = false;
    items += result.items.length;
    for (const item of result.items) {
      const snippetKey = anchorKey(item.snippet);
      if (snippetKey.includes(key)) hit = true;
      const digitsOnly = snippetKey.replace(/,/g, "");
      if (numbers.length > 0 && numbers.every((n) => digitsOnly.includes(n))) valueHit = true;
    }
  }
  return {
    failed,
    items,
    hit,
    valueHit: numbers.length > 0 ? valueHit : hit,
    ms: Date.now() - started,
  };
}

export async function runEvidenceHitRate(
  options: EvidenceHitRateOptions,
): Promise<EvidenceHitRateResult> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const limit = options.limitPerQuery ?? 3;
  const gold = loadGoldVerdicts();
  const anchored = gold.items.filter(
    (item): item is GoldVerdictItem & { anchor: string } =>
      item.anchor !== null && (options.onlyIds === undefined || options.onlyIds.includes(item.id)),
  );
  let done = 0;
  const items = await mapWithConcurrency(anchored, options.concurrency ?? 3, async (item) => {
    const queries =
      options.queries === "llm" && options.llmConfig !== undefined
        ? await llmQueries(options.llmConfig, item.claim)
        : [item.claim];
    const layers = buildLayers(item.lang, fetchImpl, options.zhipuApiKey);
    const outcome: ItemOutcome = {
      id: item.id,
      lang: item.lang,
      claimType: item.claimType,
      label: item.label,
      anchor: item.anchor,
      queries,
      layers: {},
      anyHit: false,
      anyValueHit: false,
    };
    for (const layer of EVIDENCE_LAYERS) {
      const provider = layers[layer];
      if (provider === undefined) continue;
      outcome.layers[layer] = await runLayer(provider, queries, item.anchor, limit);
    }
    outcome.anyHit = Object.values(outcome.layers).some((o) => o.hit);
    outcome.anyValueHit = Object.values(outcome.layers).some((o) => o.valueHit);
    done += 1;
    options.onItem?.(done, anchored.length, item.id);
    return outcome;
  });
  return {
    queries: options.queries,
    anchoredItems: items.length,
    layers: Object.fromEntries(
      EVIDENCE_LAYERS.map((layer) => [layer, summarise(items, layer)]),
    ) as Record<EvidenceLayer, LayerSummary | "skipped">,
    anyLayerHitRate:
      items.length === 0 ? 0 : items.filter((item) => item.anyHit).length / items.length,
    anyLayerValueHitRate:
      items.length === 0 ? 0 : items.filter((item) => item.anyValueHit).length / items.length,
    byLanguage: sliceTable(items, (item) => item.lang),
    byClaimType: sliceTable(items, (item) => item.claimType),
    items,
  };
}
