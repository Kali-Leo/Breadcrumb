/**
 * Purpose: the source of the source — the reference URL (P854) each chosen Wikidata
 * statement cites, fetched in one small query keyed by statement IRI. Its own query rather
 * than a join on the statement query because the reference join is what makes WDQS slow
 * (measured: 0.6 s without it, 2.5–7.5 s with it on a heavy entity), and only a handful of
 * statements ever need it.
 * Main exports: fetchReferences.
 */
import { z } from "zod";
import type { FetchLike } from "./provider";
import { runSparql } from "./wikidataQuery";

const literal = z.object({ value: z.string() });
const referenceRowSchema = z.object({ st: literal, ref: literal });

/** The first reference URL (P854) of each given statement, keyed by statement IRI. Best
 * effort: an empty map on any failure — a fact without its citation line is still a fact
 * from Wikidata, and the entity page carries the references anyway. */
export async function fetchReferences(
  fetchImpl: FetchLike,
  timeoutMs: number,
  statementIris: readonly string[],
): Promise<Map<string, string>> {
  const references = new Map<string, string>();
  if (statementIris.length === 0) return references;
  const values = statementIris.map((iri) => `<${iri}>`).join(" ");
  const query = `SELECT ?st ?ref WHERE { VALUES ?st { ${values} } ?st prov:wasDerivedFrom/pr:P854 ?ref . } LIMIT ${statementIris.length * 4}`;
  try {
    for (const raw of await runSparql(fetchImpl, timeoutMs, query)) {
      const row = referenceRowSchema.safeParse(raw);
      if (row.success && !references.has(row.data.st.value)) {
        references.set(row.data.st.value, row.data.ref.value);
      }
    }
  } catch {
    // A missing citation line is not a missing fact.
  }
  return references;
}
