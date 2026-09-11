/**
 * Purpose: the entity step of the structured path — turn a search query into a Wikidata item
 * (QID + label in the learner's language) through `wbsearchentities`. The query is a keyword
 * string the extractor wrote («珠穆朗玛峰 海拔 8848.86», «Mount Everest elevation»), not an
 * entity name, so it is tried as progressively shorter prefixes: the whole query, then with
 * the last term dropped, and so on. Measured: the endpoint matches labels across languages
 * whatever `language` says, so one request per candidate string is enough. Several hits come
 * back per matching string, because a name is often two items («中国» is both the
 * civilisation and the People's Republic, and the population lives on the second), and two
 * strings' worth, because the first term is sometimes a generic word («Mlima Everest»).
 * Main exports: findWikidataEntities, entityCandidates, WikidataEntity.
 */
import { z } from "zod";
import type { FetchLike } from "./provider";
import { fetchWikimediaJson } from "./wikimedia";

const searchSchema = z.object({
  search: z.array(
    z.object({
      id: z.string().regex(/^Q\d+$/),
      label: z.string().optional(),
      description: z.string().optional(),
      /** The label or alias the candidate string was matched against. */
      match: z.object({ text: z.string() }).optional(),
    }),
  ),
});

export interface WikidataEntity {
  /** `Q513` */
  id: string;
  /** The label in the requested language, or whatever the API fell back to. */
  label: string;
  description: string;
}

/** Candidate strings tried against the entity index, at most this many. Each one is a
 * request, and a query has rarely more than three terms of entity name. */
const MAX_CANDIDATES = 4;

/** Items returned for the string that matched. */
const HITS_PER_CANDIDATE = 3;

/**
 * The index matches by prefix, and Wikidata holds millions of scholarly-article items whose
 * titles begin with ordinary words: «water boiling point» matched «Water Boiling Inside
 * Carbon Nanotubes: Toward Efficient Drug Release» (measured). A hit counts only when the
 * name it matched on is the candidate string itself, give or take a couple of characters.
 */
const MATCH_SLACK = 2;

/** A bare number is never an entity name; a candidate that ends in one is tried without it. */
const NUMERIC = /^[\d.,%]+$/;

/** The strings worth asking the entity index about, in the order to ask: the whole query,
 * its prefixes down to two terms, then the first and the second term alone (the entity is
 * the first term in a keyword query, or the second when the first is a generic «Mount»,
 * «Mlima»). Case is kept: a label the learner typed is a label the learner typed. */
export function entityCandidates(query: string): string[] {
  const terms = query
    .split(/[\s,，、;；:：!！?？"'“”‘’()（）[\]【】]+/)
    .filter((term) => term.length > 0 && !NUMERIC.test(term));
  const candidates: string[] = [];
  for (let length = terms.length; length >= 2; length -= 1) {
    candidates.push(terms.slice(0, length).join(" "));
  }
  candidates.push(...terms.slice(0, 2));
  return [...new Set(candidates)].slice(0, MAX_CANDIDATES);
}

/**
 * The entities the index recognises, candidate string by candidate string (best hit first
 * within each), stopping after `maxCandidates` strings have matched something. Throws when a
 * request itself fails — the provider turns that into a failed search rather than an empty
 * one.
 */
export async function findWikidataEntities(
  fetchImpl: FetchLike,
  timeoutMs: number,
  query: string,
  language: string,
  maxMatchingCandidates = 2,
): Promise<WikidataEntity[]> {
  const found: WikidataEntity[] = [];
  let matchingCandidates = 0;
  for (const candidate of entityCandidates(query)) {
    if (matchingCandidates >= maxMatchingCandidates) break;
    const url =
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&origin=*&limit=${HITS_PER_CANDIDATE}` +
      `&language=${encodeURIComponent(language)}&uselang=${encodeURIComponent(language)}` +
      `&search=${encodeURIComponent(candidate)}`;
    const payload = await fetchWikimediaJson(fetchImpl, timeoutMs, url);
    if (payload === null) throw new Error("wikidata entity search refused");
    const hits = searchSchema
      .parse(payload)
      .search.filter(
        (hit) => hit.match === undefined || hit.match.text.length <= candidate.length + MATCH_SLACK,
      );
    if (hits.length === 0) continue;
    matchingCandidates += 1;
    for (const hit of hits) {
      if (found.some((entity) => entity.id === hit.id)) continue;
      found.push({ id: hit.id, label: hit.label ?? hit.id, description: hit.description ?? "" });
    }
  }
  return found;
}
