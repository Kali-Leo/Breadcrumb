/**
 * Purpose: the structured evidence provider (layer 1) — Wikidata, key-free and CORS-open
 * (`Access-Control-Allow-Origin: *` on both the entity index and the query service, measured
 * 2026-09-11), for the claims prose is worst at: a figure, a date, a unit, an entity
 * relation. The path is entity → properties → statements → a few rendered sentences: the
 * query names an entity, the entity's properties are matched against the query's words, the
 * current statements of those few properties come back labelled in the learner's language
 * and are rendered by code into sentences, and the item's citations ride along as the source
 * of the source. Why this is worth a provider of its own: on the
 * low-resource languages this product exists for, Wikidata labels cover an order of magnitude
 * more facts than that language's Wikipedia has articles.
 * Main exports: createWikidataProvider, WikidataProviderOptions.
 */
import type { EvidenceProvider, EvidenceSearchResult, FetchLike } from "./provider";
import { DEFAULT_TIMEOUT_MS } from "./provider";
import { capStatements, selectProperties } from "./wikidataFacts";
import { findWikidataEntities, type WikidataEntity } from "./wikidataLookup";
import { fetchProperties, fetchStatements, type WikidataProperty } from "./wikidataQuery";
import { fetchReferences } from "./wikidataReferences";
import { type FactRenderer, neutralFactRenderer, renderFact } from "./wikidataRender";
import { wikidataLanguagesOf } from "./wikimedia";

export interface WikidataProviderOptions {
  fetchImpl: FetchLike;
  /** The learner's language (a UI language code). Labels come back in it where they exist,
   * English otherwise, and the rendered sentence is in it — a Chinese learner must not be
   * asked to copy an English sentence to pass the anchor gate. */
  language: string;
  /** How one fact becomes one sentence; the app passes a catalogue-backed one. */
  renderFact?: FactRenderer;
  /** Per-request timeout. WDQS has been slow in 2026; a timeout falls through to the next
   * layer and must never read as "Wikidata has nothing on this". */
  timeoutMs?: number;
}

/** An entity together with the properties of it the query is about. */
interface Target {
  entity: WikidataEntity;
  properties: WikidataProperty[];
  propertyIds: string[];
  headlineCount: number;
}

/** Property queries spent telling candidate entities apart, per search. */
const MAX_TARGET_PROBES = 4;

/**
 * The first hit whose properties the query actually names; failing that, the hit with the
 * most headline facts. A name is often two items — «中国» is the civilisation first and the
 * People's Republic second, and the population lives on the second; «Mlima» is the class of
 * mountains and «Everest» the one with an elevation — so a few more properties queries are
 * worth it when the first item has nothing called what the query asks for.
 */
async function pickTarget(
  fetchImpl: FetchLike,
  timeoutMs: number,
  entities: readonly WikidataEntity[],
  query: string,
  languages: readonly string[],
): Promise<Target | null> {
  let fallback: Target | null = null;
  for (const entity of entities.slice(0, MAX_TARGET_PROBES)) {
    const properties = await fetchProperties(fetchImpl, timeoutMs, entity.id, languages);
    const selection = selectProperties(properties, query, entity.label);
    const target = { entity, properties, ...selection, propertyIds: selection.ids };
    if (selection.matched) return target;
    if (fallback === null || target.headlineCount > fallback.headlineCount) fallback = target;
  }
  return fallback;
}

export function createWikidataProvider(options: WikidataProviderOptions): EvidenceProvider {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const render = options.renderFact ?? neutralFactRenderer;
  const languages = wikidataLanguagesOf(options.language);
  const lookupLanguage = languages[0] ?? "en";
  return {
    name: "wikidata",
    async search(query: string, limit: number): Promise<EvidenceSearchResult> {
      if (limit < 1) return { items: [], failed: false };
      try {
        const entities = await findWikidataEntities(
          options.fetchImpl,
          timeoutMs,
          query,
          lookupLanguage,
        );
        const target = await pickTarget(options.fetchImpl, timeoutMs, entities, query, languages);
        // The index answered and knows no such entity: a completed search, not a failed one.
        if (target === null) return { items: [], failed: false };
        const { entity, properties, propertyIds } = target;
        const statements = await fetchStatements(
          options.fetchImpl,
          timeoutMs,
          entity.id,
          propertyIds,
          languages,
        );
        const chosen = capStatements(statements, propertyIds);
        if (chosen.length === 0) return { items: [], failed: false };
        const references = await fetchReferences(
          options.fetchImpl,
          timeoutMs,
          chosen.map((statement) => statement.iri),
        );
        const labelOf = new Map(properties.map((property) => [property.id, property.label]));
        const snippet = chosen
          .map((statement) =>
            renderFact(
              entity.label,
              labelOf.get(statement.property) ?? statement.property,
              statement,
              references.get(statement.iri) ?? null,
              render,
            ),
          )
          .join("\n");
        return {
          items: [
            {
              url: `https://www.wikidata.org/wiki/${entity.id}`,
              title: entity.label,
              snippet,
              source: "wikidata",
            },
          ],
          failed: false,
        };
      } catch {
        // Blocked network, timeout, refused request, malformed answer: nothing was learned.
        return { items: [], failed: true };
      }
    },
  };
}
