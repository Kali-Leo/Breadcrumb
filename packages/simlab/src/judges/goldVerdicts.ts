/**
 * Purpose: the verdict gold set — 200 hand-labelled (claim, evidence, verdict) triples in
 * data/gold-verdicts.json, loaded and validated here. It is the only ground truth we have for
 * the fact-check judge, the one step of that pipeline that had never been measured.
 *
 * Two rules make a label re-checkable by a person in seconds, and both are enforced by
 * goldVerdicts.test.ts rather than trusted:
 *  - a `supported` or `contradicted` item carries an `anchor` that is a VERBATIM substring of
 *    the one evidence passage named by `decisive`. Read the anchor next to the claim and the
 *    label is either obviously right or obviously wrong.
 *  - an `insufficient` item carries no anchor at all — there is nothing in the evidence to
 *    point at — so `why` has to say what the evidence never states.
 *
 * `hard` marks the difficult negatives: evidence on the claim's own topic, with heavy word
 * overlap, that still does not support it. Those are where a false "supported" comes from,
 * and a false supported is the failure that hands a learner a wrong sentence with a citation
 * under it.
 *
 * Main exports: loadGoldVerdicts, goldVerdictEvidence, GoldVerdictItem, GoldVerdictSource,
 * GoldVerdictSet, GOLD_VERDICTS_PATH.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EvidenceItem } from "@breadcrumb/feature-factcheck";
import { z } from "zod";

export const GOLD_VERDICTS_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "data",
  "gold-verdicts.json",
);

/** What kind of statement the claim is — reported so a weakness can be located rather than
 * only counted (a judge that is fine on definitions and blind on numbers is a specific bug). */
export const GOLD_CLAIM_TYPES = [
  "number",
  "date",
  "causal",
  "definition",
  "negation",
  "entity",
  "comparison",
] as const;

const sourceSchema = z.object({
  id: z.string().min(1),
  /** BCP-47 tag the passage is written in; the claim over it is in the same language. */
  lang: z.string().min(2),
  /** Provider name, as the real pipeline reports it. */
  source: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  /** The passage itself, verbatim from the page. */
  text: z.string().min(40),
});

const itemSchema = z.object({
  id: z.string().min(1),
  lang: z.string().min(2),
  claim: z.string().min(1),
  claimType: z.enum(GOLD_CLAIM_TYPES),
  /** A difficult negative: related, lexically overlapping evidence that does not support the
   * claim. Never set on a `supported` item — there is no such thing as a hard positive here. */
  hard: z.boolean(),
  /** Source ids, in the order the gold file lists them (the scenario shuffles them the way
   * the product does before judging). */
  evidence: z.array(z.string().min(1)).min(1).max(3),
  label: z.enum(["supported", "contradicted", "insufficient"]),
  /** Source id carrying the decisive passage; null for `insufficient`. */
  decisive: z.string().min(1).nullable(),
  /** Verbatim substring of the decisive passage that settles the label; null for
   * `insufficient`. */
  anchor: z.string().min(1).nullable(),
  /** Why this label, in plain words — the human re-checking the set reads this. */
  why: z.string().min(1),
});

const fileSchema = z.object({
  $comment: z.string(),
  retrievedAt: z.string(),
  license: z.string(),
  sources: z.array(sourceSchema).min(1),
  items: z.array(itemSchema).min(1),
});

export type GoldVerdictSource = z.infer<typeof sourceSchema>;
export type GoldVerdictItem = z.infer<typeof itemSchema>;

export interface GoldVerdictSet {
  retrievedAt: string;
  sources: GoldVerdictSource[];
  items: GoldVerdictItem[];
  /** Source lookup, so a caller never re-scans the array per item. */
  sourceById: Map<string, GoldVerdictSource>;
}

export function loadGoldVerdicts(path: string = GOLD_VERDICTS_PATH): GoldVerdictSet {
  const parsed = fileSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
  return {
    retrievedAt: parsed.retrievedAt,
    sources: parsed.sources,
    items: parsed.items,
    sourceById: new Map(parsed.sources.map((source) => [source.id, source])),
  };
}

/**
 * The item's evidence as the pipeline's own EvidenceItem shape, in gold-file order. Throws on
 * an unknown source id: a gold item pointing at evidence that does not exist is a broken
 * fixture, and silently judging a shorter list would quietly change what was asked.
 */
export function goldVerdictEvidence(
  item: GoldVerdictItem,
  sourceById: ReadonlyMap<string, GoldVerdictSource>,
): EvidenceItem[] {
  return item.evidence.map((id) => {
    const source = sourceById.get(id);
    if (source === undefined) throw new Error(`goldVerdictEvidence: unknown source ${id}`);
    return { url: source.url, title: source.title, snippet: source.text, source: source.source };
  });
}
