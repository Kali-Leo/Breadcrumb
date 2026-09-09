/**
 * Purpose: bench scenarios for the fact-check judge itself, run over the 200-item gold set in
 * data/gold-verdicts.json through the product's own buildVerdictMessages + createVerdictSchema.
 * Until this file existed the bench only measured claim EXTRACTION, so the step that decides
 * whether a learner is told "找到了佐证" had never been scored at all.
 *
 * Four configurations of the same 200 items, so the hardening measures can be told apart
 * instead of averaged: the shipped quote-free prompt (the baseline every other row is read
 * against), the quote prompt whose answer the anchor gate mechanically checks, and that same
 * prompt with the evidence list padded to 3 and to 6 passages. Padding is what makes an
 * evidence-width answer possible at all: a gold item carries one or two passages, and the
 * decisive one is always among them, so the extra passages are same-language distractors and
 * the wide rows measure robustness to noise rather than a better chance of finding the answer.
 *
 * The headline number is `falseSupportRate`: how often a claim whose gold label is not
 * `supported` comes back as `supported`. That is the probability of handing a learner a wrong
 * sentence with a citation under it, which is worse than saying nothing.
 *
 * Main exports: verdictScenarios, verdictTruths, VERDICT_PURPOSE, VERDICT_VARIANTS.
 */
import {
  buildVerdictMessages,
  createVerdictSchema,
  type EvidenceItem,
  seededShuffle,
} from "@breadcrumb/feature-factcheck";
import {
  type GoldVerdictItem,
  type GoldVerdictSource,
  goldVerdictEvidence,
  loadGoldVerdicts,
} from "../../judges/goldVerdicts";
import { type BenchScenario, type JsonBenchScenario, jsonScenario } from "../scenarioTypes";
import { scoreVerdict, type VerdictTruth } from "./verdictTruth";

/** The purpose name the shipped-baseline suite reports under — the judging half of `factcheck`,
 * kept separate so the two halves of the pipeline never average into one meaningless column. */
export const VERDICT_PURPOSE = "factcheck-verdict";

/** One way of asking the same 200 questions. */
export interface VerdictVariant {
  purpose: string;
  /** Ask for the verbatim quote and put the anchor gate in front of the label. */
  quote: boolean;
  /** Pad the evidence list up to this many passages with same-language distractors; null keeps
   * the gold item's own one or two. */
  padTo: number | null;
}

export const VERDICT_VARIANTS: readonly VerdictVariant[] = [
  { purpose: VERDICT_PURPOSE, quote: false, padTo: null },
  { purpose: "factcheck-verdict-quote", quote: true, padTo: null },
  { purpose: "factcheck-verdict-quote3", quote: true, padTo: 3 },
  { purpose: "factcheck-verdict-quote6", quote: true, padTo: 6 },
];

/** Same-language passages the item does not already carry, in a deterministic per-claim order.
 * Same language because a distractor in another script is no distraction at all. */
function distractors(item: GoldVerdictItem, sources: readonly GoldVerdictSource[]): EvidenceItem[] {
  const own = new Set(item.evidence);
  const pool = sources.filter((source) => source.lang === item.lang && !own.has(source.id));
  return seededShuffle(pool, `${item.claim}|pad`).map((source) => ({
    url: source.url,
    title: source.title,
    snippet: source.text,
    source: source.source,
  }));
}

/** The evidence list the prompt will show, in the order it will show it. Padding happens before
 * the shuffle, so a distractor is as likely to land in slot one as the decisive passage. */
function evidenceFor(
  item: GoldVerdictItem,
  variant: VerdictVariant,
  gold: { sources: GoldVerdictSource[]; sourceById: Map<string, GoldVerdictSource> },
): EvidenceItem[] {
  const own = goldVerdictEvidence(item, gold.sourceById);
  const padded =
    variant.padTo === null
      ? own
      : [
          ...own,
          ...distractors(item, gold.sources).slice(0, Math.max(0, variant.padTo - own.length)),
        ];
  // Exactly what pipeline.ts does before judging: seeded by the claim, so the order is stable
  // across runs and does not track the order the gold file happens to list evidence in.
  return seededShuffle(padded, item.claim);
}

/** 1-based index of the decisive passage after the shuffle, or null when the item has none
 * (every `insufficient` item, by construction). */
function decisiveIndex(
  item: GoldVerdictItem,
  evidence: readonly EvidenceItem[],
  sourceById: ReadonlyMap<string, GoldVerdictSource>,
): number | null {
  if (item.decisive === null) return null;
  const source = sourceById.get(item.decisive);
  if (source === undefined) return null;
  const index = evidence.findIndex((entry) => entry.snippet === source.text);
  return index < 0 ? null : index + 1;
}

/** One scenario and its ground truth, built together so the scoring can never disagree with
 * the prompt about how many passages there were or which one was decisive. */
export interface VerdictCase {
  scenario: JsonBenchScenario;
  truth: VerdictTruth;
}

function verdictCase(
  item: GoldVerdictItem,
  variant: VerdictVariant,
  gold: { sources: GoldVerdictSource[]; sourceById: Map<string, GoldVerdictSource> },
): VerdictCase {
  const evidence = evidenceFor(item, variant, gold);
  const truth: VerdictTruth = {
    scenarioId: `${variant.purpose}/${item.lang}/${item.id}`,
    purpose: variant.purpose,
    itemId: item.id,
    language: item.lang,
    gold: item.label,
    hard: item.hard,
    gated: variant.quote,
    evidence,
    decisiveIndex: decisiveIndex(item, evidence, gold.sourceById),
  };
  const scenario = jsonScenario({
    purpose: variant.purpose,
    id: truth.scenarioId,
    language: item.lang,
    messages: buildVerdictMessages(item.claim, evidence, { requireQuote: variant.quote }),
    schema: createVerdictSchema(evidence.length),
    check: (parsed) => scoreVerdict(truth, parsed),
    // Against the reference model this is one question only: same verdict or not.
    agree: (reference, candidate) => (reference.relationship === candidate.relationship ? 1 : 0),
  });
  return { scenario, truth };
}

/** Every configuration × every gold item. Deterministic: same repository, same prompts. */
export function verdictCases(): VerdictCase[] {
  const gold = loadGoldVerdicts();
  return VERDICT_VARIANTS.flatMap((variant) =>
    gold.items.map((item) => verdictCase(item, variant, gold)),
  );
}

export function verdictScenarios(): BenchScenario[] {
  return verdictCases().map((entry) => entry.scenario);
}

/** The ground truth the ensemble analysis joins a results file against, keyed by scenario id. */
export function verdictTruths(): Map<string, VerdictTruth> {
  return new Map(verdictCases().map((entry) => [entry.truth.scenarioId, entry.truth]));
}
