/**
 * Purpose: choosing what the structured path shows — which of an entity's properties the
 * query is about, the rank rule, and the per-property cap. The rank rule is the one
 * non-negotiable: Wikidata keeps every measurement ever recorded and marks the current one
 * `preferred`; taken flat, Everest comes back as 8848.86, 8848, 8850 and 8844.43 at once
 * (measured), and the structured path would be manufacturing contradictions. Turning the
 * chosen statements into sentences is wikidataRender.ts.
 * Main exports: selectProperties, currentStatements, capStatements, MAX_FACTS_PER_ENTITY.
 */
import { queryTerms } from "./pageText";
import type { WikidataProperty, WikidataStatement } from "./wikidataQuery";

/** Sentences per entity: enough to carry the fact asked about and its neighbours (a reading
 * and its predecessor, a birth and a death), few enough to stay one excerpt. */
export const MAX_FACTS_PER_ENTITY = 6;

/** Properties fetched per query: the ones the query names, filled up from the headline set. */
const MAX_PROPERTIES = 6;

/** Readings kept per property. Two rather than one so a value with a date and its predecessor
 * can both appear — not the twenty yearly visitor counts Everest carries. */
const MAX_PER_PROPERTY = 2;

/**
 * The properties a learning claim is most often about, in the order they are worth showing
 * when the query names no property by label («高度» where the label says «海拔»): elevation,
 * population, area, capital, country, birth/death, inception/dissolution, publication,
 * numeric value, dimensions, mass, melting/boiling point, deaths, place of birth/death,
 * citizenship, occupation, instance of, named after, discoverer, discovery date.
 */
const HEADLINE_PROPERTIES: readonly string[] = [
  "P2044",
  "P1082",
  "P2046",
  "P36",
  "P17",
  "P569",
  "P570",
  "P571",
  "P576",
  "P577",
  "P1181",
  "P2048",
  "P2049",
  "P2043",
  "P2067",
  "P2101",
  "P2102",
  "P1120",
  "P19",
  "P20",
  "P27",
  "P106",
  "P31",
  "P138",
  "P61",
  "P575",
];

/** A term shorter than this matches too much (a single hanzi is in half the labels). */
const MIN_TERM_LENGTH = 2;

/**
 * Which of the entity's properties the query is about: those with a label or alias that
 * contains a query term, or that the query contains (multi-word aliases like «capital city»),
 * most terms matched first, then the shortest label — «人口» before «人口密度». Terms that are
 * part of the entity's own name are not counted: they are the subject, not the property.
 * Filled up to MAX_PROPERTIES from the headline set, in headline order.
 */
export function selectProperties(
  properties: readonly WikidataProperty[],
  query: string,
  subjectLabel: string,
): { ids: string[]; matched: boolean; headlineCount: number } {
  const subject = subjectLabel.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const terms = queryTerms(query).filter(
    (term) => term.length >= MIN_TERM_LENGTH && !subject.includes(term) && !/^[\d.,%]+$/.test(term),
  );
  const matched = properties
    .map((property) => {
      const byTerm = terms.filter((term) =>
        property.names.some((name) => name.includes(term)),
      ).length;
      const byName = property.names.some(
        (name) =>
          name.length >= MIN_TERM_LENGTH && !subject.includes(name) && lowerQuery.includes(name),
      );
      return { property, score: byTerm + (byName ? 1 : 0) };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.property.label.length - b.property.label.length)
    .map(({ property }) => property.id);
  const present = new Set(properties.map((property) => property.id));
  const chosen = [...new Set(matched)].slice(0, MAX_PROPERTIES);
  for (const id of HEADLINE_PROPERTIES) {
    if (chosen.length >= MAX_PROPERTIES) break;
    if (present.has(id) && !chosen.includes(id)) chosen.push(id);
  }
  return {
    ids: chosen,
    matched: matched.length > 0,
    headlineCount: HEADLINE_PROPERTIES.filter((id) => present.has(id)).length,
  };
}

/**
 * The rank rule: per property, the `preferred` statements when any exist, otherwise the
 * `normal` ones. Deprecated statements never reach this function (filtered in SPARQL), and
 * a `normal` value beside a `preferred` one is a superseded reading, not a second truth.
 */
export function currentStatements(statements: readonly WikidataStatement[]): WikidataStatement[] {
  const preferred = new Set(
    statements.filter((statement) => statement.rank === "preferred").map((s) => s.property),
  );
  return statements.filter((s) => s.rank === "preferred" || !preferred.has(s.property));
}

/** Current statements, at most MAX_PER_PROPERTY each (the query already returns preferred
 * first and latest reading first) in the order of `propertyIds`, at most `max` in all. */
export function capStatements(
  statements: readonly WikidataStatement[],
  propertyIds: readonly string[],
  max: number = MAX_FACTS_PER_ENTITY,
): WikidataStatement[] {
  const current = currentStatements(statements);
  const chosen: WikidataStatement[] = [];
  for (const id of propertyIds) {
    for (const statement of current.filter((s) => s.property === id).slice(0, MAX_PER_PROPERTY)) {
      if (chosen.length >= max) return chosen;
      chosen.push(statement);
    }
  }
  return chosen;
}
