/**
 * Purpose: the SPARQL half of the structured path, in small queries rather than one big
 * one. (1) The entity's properties, with labels and aliases in the learner's language and
 * English — a hundred rows for a country. (2) The statements of the few properties the
 * query names — rank included, deprecated ones excluded at the source. (The citations of
 * the chosen statements are a third query, in wikidataReferences.ts.) Measured reasons for
 * the split: a flat "every statement" query on a country returns 150 rows of «language
 * used» before «capital» ever appears, and the reference join alone turns 0.6 s into
 * 2.5–7.5 s. Every response is Zod-validated.
 * Main exports: fetchProperties, fetchStatements, runSparql, WikidataProperty,
 * WikidataStatement, StatementValue.
 */
import { z } from "zod";
import type { FetchLike } from "./provider";
import { fetchWikimediaJson } from "./wikimedia";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

/** Statement rows per entity query. Preferred first, then the latest readings, so a truncated
 * result keeps what Wikidata itself marks as current. Six properties, one of which may be a
 * country's forty population readings, fit comfortably. */
const MAX_STATEMENT_ROWS = 150;

const literal = z.object({ value: z.string() });
const resultsSchema = z.object({ results: z.object({ bindings: z.array(z.unknown()) }) });
const propertyRowSchema = z.object({
  prop: literal,
  propLabel: literal.optional(),
  aliases: literal.optional(),
});
const statementRowSchema = z.object({
  st: literal,
  prop: literal,
  rank: literal,
  amount: literal.optional(),
  unitLabel: literal.optional(),
  time: literal.optional(),
  precision: literal.optional(),
  item: literal.optional(),
  itemLabel: literal.optional(),
  pointInTime: literal.optional(),
});

const ENTITY_PREFIX = "http://www.wikidata.org/entity/";
const FACT_TYPES = "wikibase:Quantity, wikibase:Time, wikibase:WikibaseItem";

export interface WikidataProperty {
  /** `P2044` */
  id: string;
  /** In the first of the label languages that has one. */
  label: string;
  /** Every label and alias in those languages, lower-cased — what a query term is matched to. */
  names: string[];
}

export type StatementValue =
  | { kind: "quantity"; amount: string; unit: string | null }
  | { kind: "time"; time: string; precision: number }
  | { kind: "item"; id: string; label: string };

export interface WikidataStatement {
  /** Statement IRI — what the reference query is keyed by. */
  iri: string;
  property: string;
  rank: "preferred" | "normal";
  value: StatementValue;
  /** The P585 qualifier, when the statement is a reading at a date (a population count). */
  pointInTime: string | null;
}

function languageList(languages: readonly string[]): string {
  return languages.map((language) => `"${language}"`).join(", ");
}

export async function runSparql(
  fetchImpl: FetchLike,
  timeoutMs: number,
  query: string,
): Promise<unknown[]> {
  const url = `${SPARQL_ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;
  const payload = await fetchWikimediaJson(fetchImpl, timeoutMs, url, {
    Accept: "application/sparql-results+json",
  });
  if (payload === null) throw new Error("wikidata query service refused");
  return resultsSchema.parse(payload).results.bindings;
}

/** Every quantity/date/item property the entity has a statement for. Throws when the query
 * service does not answer. */
export async function fetchProperties(
  fetchImpl: FetchLike,
  timeoutMs: number,
  entityId: string,
  languages: readonly string[],
): Promise<WikidataProperty[]> {
  const query = `SELECT ?prop ?propLabel (GROUP_CONCAT(DISTINCT ?alias; separator="|") AS ?aliases) WHERE {
  wd:${entityId} ?p ?st .
  ?prop wikibase:claim ?p ; wikibase:propertyType ?type .
  FILTER(?type IN (${FACT_TYPES}))
  OPTIONAL { { ?prop rdfs:label ?alias } UNION { ?prop skos:altLabel ?alias } FILTER(LANG(?alias) IN (${languageList(languages)})) }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${languages.join(",")}". }
}
GROUP BY ?prop ?propLabel`;
  const properties: WikidataProperty[] = [];
  for (const raw of await runSparql(fetchImpl, timeoutMs, query)) {
    const row = propertyRowSchema.safeParse(raw);
    if (!row.success) continue;
    const id = row.data.prop.value.replace(ENTITY_PREFIX, "");
    const label = row.data.propLabel?.value ?? id;
    const aliases = (row.data.aliases?.value ?? "").split("|");
    const names = [...new Set([label, ...aliases].map((name) => name.trim().toLowerCase()))].filter(
      (name) => name.length > 0,
    );
    properties.push({ id, label, names });
  }
  return properties;
}

function rowToStatement(row: z.infer<typeof statementRowSchema>): WikidataStatement | null {
  const base = {
    iri: row.st.value,
    property: row.prop.value.replace(ENTITY_PREFIX, ""),
    rank: row.rank.value.endsWith("#PreferredRank") ? ("preferred" as const) : ("normal" as const),
    pointInTime: row.pointInTime?.value ?? null,
  };
  if (row.amount !== undefined) {
    // Wikidata's dimensionless unit is the literal "1".
    const unit = row.unitLabel?.value;
    const value = {
      kind: "quantity" as const,
      amount: row.amount.value,
      unit: unit === undefined || unit === "1" ? null : unit,
    };
    return { ...base, value };
  }
  if (row.time !== undefined) {
    const precision = Number(row.precision?.value ?? "11");
    return { ...base, value: { kind: "time", time: row.time.value, precision } };
  }
  if (row.item !== undefined) {
    const id = row.item.value.replace(ENTITY_PREFIX, "");
    const label = row.itemLabel?.value ?? id;
    // The label service's placeholder for an unlabelled item is its bare Q-id: not a fact.
    return label === id ? null : { ...base, value: { kind: "item", id, label } };
  }
  return null;
}

/** The non-deprecated statements of the given properties, values labelled in the first of
 * `languages` that has a label. Throws when the query service does not answer. */
export async function fetchStatements(
  fetchImpl: FetchLike,
  timeoutMs: number,
  entityId: string,
  propertyIds: readonly string[],
  languages: readonly string[],
): Promise<WikidataStatement[]> {
  if (propertyIds.length === 0) return [];
  const query = `SELECT ?st ?prop ?rank ?amount ?unitLabel ?time ?precision ?item ?itemLabel ?pointInTime WHERE {
  VALUES ?prop { ${propertyIds.map((id) => `wd:${id}`).join(" ")} }
  ?prop wikibase:claim ?p ; wikibase:statementValue ?psv ; wikibase:statementProperty ?ps .
  wd:${entityId} ?p ?st .
  ?st wikibase:rank ?rank .
  FILTER(?rank != wikibase:DeprecatedRank)
  OPTIONAL { ?st ?psv ?qv . ?qv wikibase:quantityAmount ?amount ; wikibase:quantityUnit ?unit . }
  OPTIONAL { ?st ?psv ?tv . ?tv wikibase:timeValue ?time ; wikibase:timePrecision ?precision . }
  OPTIONAL { ?st ?ps ?item . FILTER(STRSTARTS(STR(?item), "${ENTITY_PREFIX}Q")) }
  OPTIONAL { ?st pq:P585 ?pointInTime . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${languages.join(",")}". }
}
ORDER BY DESC(?rank) DESC(?pointInTime)
LIMIT ${MAX_STATEMENT_ROWS}`;
  const statements: WikidataStatement[] = [];
  for (const raw of await runSparql(fetchImpl, timeoutMs, query)) {
    const row = statementRowSchema.safeParse(raw);
    if (!row.success) continue;
    const statement = rowToStatement(row.data);
    if (statement !== null) statements.push(statement);
  }
  return statements;
}
