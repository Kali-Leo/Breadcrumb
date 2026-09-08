/**
 * Purpose: bench scenarios for `diglot-weave` — the refinement call that decides, in context,
 * whether each scheduled dictionary replacement is right, and optionally weaves one idiomatic
 * phrase. Its inputs are entirely real: the shipped zh:en language pack (CC-CEDICT derived)
 * supplies the lemmas and their dictionary translations, and the Chinese demo texts supply
 * the sentences those lemmas actually occur in.
 *
 * The checks run the model's reply through applyLlmRefinement — the product's own defensive
 * applier — so "usable" here means what it means in the app: a retranslation the guard
 * accepts, a phrase that survives the diff check. A model can satisfy the schema and still
 * produce nothing the weave can use, and that gap is exactly what this measures.
 *
 * Only zh:en, because that is the only pack the repo ships. A second pack would be a second
 * language row here and nothing else.
 * Main exports: diglotScenarios.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { demoTextFor } from "@breadcrumb/demo-seed";
import {
  applyLlmRefinement,
  buildLlmRefineMessages,
  type LoadedLanguagePack,
  llmRefineResponseSchema,
  loadLanguagePack,
  type ReplacementPatch,
  resolveLemma,
  tokenizeMessage,
} from "@breadcrumb/feature-diglot-weave";
import { resolveRepoRoot } from "../../runner/config";
import { type BenchScenario, jsonScenario } from "../scenarioTypes";
import { ratioScore } from "../scoring/textSimilarity";

const PACK_PATH = join("apps", "desktop", "src", "assets", "language-packs", "zh-en.json");
/** llmRefineResponseSchema caps `words` at 8; the T1 scheduler hands over far fewer than that
 * on one message, and three is what an ordinary weave density produces. */
const MAX_REPLACEMENTS = 3;
/** A message with only one candidate is not a test of in-context disambiguation. */
const MIN_REPLACEMENTS = 2;

let cachedPack: LoadedLanguagePack | null = null;

/** The shipped pack, validated through the product's own loader and parsed once — it is
 * three megabytes, and every scenario would otherwise re-read it. */
function languagePack(): LoadedLanguagePack {
  cachedPack ??= loadLanguagePack(
    JSON.parse(readFileSync(join(resolveRepoRoot(), PACK_PATH), "utf-8")) as unknown,
  );
  return cachedPack;
}

interface Candidate {
  lemma: string;
  surface: string;
  target: string;
  start: number;
  end: number;
}

/**
 * The replacements a T1 pass would schedule for this message: pack-known, t1Safe lemmas, one
 * per distinct lemma, in reading order. The weave's own dispersion rule (one per clause) is
 * deliberately NOT applied — it is a density rule for what the reader sees, and applying it
 * to one-clause sentences would leave most of this corpus with a single candidate, which
 * tests nothing about disambiguating a list.
 */
function candidatesIn(content: string, loaded: LoadedLanguagePack): Candidate[] {
  const picked: Candidate[] = [];
  const seen = new Set<string>();
  for (const token of tokenizeMessage(content, "zh")) {
    if (!token.isWordLike) continue;
    const lemma = resolveLemma(token.text, loaded);
    if (lemma === null || seen.has(lemma)) continue;
    const entry = loaded.pack.entries[lemma];
    if (entry === undefined || !entry.t1Safe) continue;
    seen.add(lemma);
    picked.push({
      lemma,
      surface: token.text,
      target: entry.target,
      start: token.start,
      end: token.end,
    });
    if (picked.length === MAX_REPLACEMENTS) break;
  }
  return picked;
}

/** Every Chinese sentence the demo learner meets: the two conversations, the teach-back, the
 * vocabulary talk, and all 39 concept summaries. */
function chineseTexts(): string[] {
  const text = demoTextFor("zh-CN");
  return [
    ...text.astroMessages,
    ...text.jsMessages,
    ...text.teachMessages,
    ...text.vocabMessages,
    ...Object.values(text.concepts).map((words) => words[1]),
  ];
}

function patchesFor(candidates: readonly Candidate[]): ReplacementPatch[] {
  return candidates.map((candidate) => ({
    start: candidate.start,
    end: candidate.end,
    original: candidate.surface,
    replacement: candidate.target,
    lemma: candidate.lemma,
    kind: "word" as const,
  }));
}

export function diglotScenarios(): BenchScenario[] {
  const loaded = languagePack();
  const scenarios: BenchScenario[] = [];
  chineseTexts().forEach((content, index) => {
    const candidates = candidatesIn(content, loaded);
    if (candidates.length < MIN_REPLACEMENTS) return;
    const asked = new Set(candidates.map((candidate) => candidate.lemma));
    const patches = patchesFor(candidates);
    scenarios.push(
      jsonScenario({
        purpose: "diglot-weave",
        id: `diglot-weave/zh-CN/${index}`,
        language: "zh-CN",
        messages: buildLlmRefineMessages({
          sourceLang: "中文",
          targetLang: "English",
          content,
          replacements: candidates.map((candidate) => ({
            lemma: candidate.lemma,
            surface: candidate.surface,
            target: candidate.target,
          })),
        }),
        schema: llmRefineResponseSchema,
        check: (parsed) => {
          const outcome = applyLlmRefinement(content, patches, parsed);
          const answered = parsed.words.filter((word) => asked.has(word.lemma));
          const intendedChanges = answered.filter((word) => word.verdict !== "keep").length;
          const scores: Record<string, number> = {
            verdictCoverage: ratioScore(answered.length, asked.size),
            verdictGrounded: ratioScore(answered.length, parsed.words.length),
          };
          // Only meaningful when the model asked for a change: this is "did the applier's
          // guards accept it", and a reply of all-keeps has nothing to accept or reject.
          if (intendedChanges > 0) {
            scores.changesAccepted = ratioScore(outcome.changedLemmas.length, intendedChanges);
          }
          if (parsed.phrase !== null) {
            scores.phraseUsable = outcome.patches.some((patch) => patch.kind === "phrase") ? 1 : 0;
          }
          return scores;
        },
        agree: (reference, candidate) => {
          const byLemma = new Map(candidate.words.map((word) => [word.lemma, word.verdict]));
          let matched = 0;
          for (const word of reference.words) {
            if (byLemma.get(word.lemma) === word.verdict) matched += 1;
          }
          return ratioScore(matched, reference.words.length);
        },
      }),
    );
  });
  return scenarios;
}
