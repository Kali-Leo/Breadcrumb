/**
 * Purpose: bench scenarios for `map-naming` — given a cluster of related knowledge points,
 * what would you call the region they form? The schema already refuses a name that is too
 * long, too short or carries digits, so the reference-free check here is the other half of
 * the contract: every cluster asked about comes back, and nothing else does.
 *
 * Clusters come from both pools — the demo tree in all eleven interface languages, and slices
 * of the canonical syllabus, which are longer and less tidy than a demo cluster ever is.
 * Main exports: mapNamingScenarios.
 */
import { languageOf } from "@breadcrumb/core-i18n";
import { buildContinentNamingMessages, continentNamingSchema } from "@breadcrumb/feature-map";
import { canonicalLabels } from "../canonicalPool";
import { BENCH_LANGUAGES, demoConcepts } from "../demoPool";
import { type BenchScenario, jsonScenario } from "../scenarioTypes";
import { diceBigram, meanScore, ratioScore } from "../scoring/textSimilarity";
import { CANONICAL_BATCHES } from "./align";

/** Members shown per cluster in a naming call — enough to have a subject, few enough that a
 * model cannot pass by listing them back. */
const CLUSTER_SIZE = 8;

/** Han, kana and hangul. A name for a reader of French carrying any of these was written in
 * the wrong language — the schema cannot see that, and the island still ends up wearing a
 * name its owner cannot read. Only checked the one way: "JavaScript" inside a Chinese name
 * is a proper noun kept as it stands, not a language slip. */
const CJK_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

const CJK_SCRIPTS = new Set(["hanzi", "kana", "hangul"]);

/** 1 when every name is free of CJK script, undefined when the reader reads one anyway. */
function readersScriptScore(language: string, names: readonly string[]): number | undefined {
  const script = languageOf(language)?.script;
  if (script === undefined || CJK_SCRIPTS.has(script)) return undefined;
  return ratioScore(names.filter((name) => !CJK_PATTERN.test(name)).length, names.length);
}

function namingScenario(
  id: string,
  language: string,
  clusters: readonly string[][],
): BenchScenario {
  const requests = clusters.map((memberLabels, index) => ({ id: `c${index}`, memberLabels }));
  const askedIds = new Set(requests.map((request) => request.id));
  return jsonScenario({
    purpose: "map-naming",
    id,
    language,
    messages: buildContinentNamingMessages(requests),
    schema: continentNamingSchema,
    check: (parsed) => {
      const returned = new Set(parsed.clusters.map((cluster) => cluster.id));
      const covered = [...askedIds].filter((clusterId) => returned.has(clusterId)).length;
      const scores: Record<string, number> = {
        idCoverage: ratioScore(covered, askedIds.size),
        idGrounded: ratioScore(
          [...returned].filter((clusterId) => askedIds.has(clusterId)).length,
          returned.size,
        ),
      };
      const inReadersScript = readersScriptScore(
        language,
        parsed.clusters.map((cluster) => cluster.name),
      );
      if (inReadersScript !== undefined) scores.nameInReadersScript = inReadersScript;
      return scores;
    },
    agree: (reference, candidate) => {
      const byId = new Map(candidate.clusters.map((cluster) => [cluster.id, cluster.name]));
      // Names are free text, so exact equality would score every model near zero and say
      // nothing; character-bigram similarity separates "微分学" from "数学" from "星空王国".
      return meanScore(
        reference.clusters.map((cluster) => diceBigram(cluster.name, byId.get(cluster.id) ?? "")),
      );
    },
  });
}

export function mapNamingScenarios(): BenchScenario[] {
  const scenarios: BenchScenario[] = BENCH_LANGUAGES.map((language) => {
    const concepts = demoConcepts(language).map((concept) => concept.label);
    return namingScenario(`map-naming/demo-${language}/0`, language, [
      concepts.slice(0, 12),
      concepts.slice(12, 24),
      concepts.slice(24, 36),
    ]);
  });
  for (const script of ["hanzi", "latin"] as const) {
    const labels = canonicalLabels(script);
    const language = script === "hanzi" ? "zh-CN" : "en";
    for (let batch = 0; batch < CANONICAL_BATCHES; batch += 1) {
      const start = batch * CLUSTER_SIZE * 3;
      const clusters = [0, 1, 2]
        .map((offset) =>
          labels.slice(start + offset * CLUSTER_SIZE, start + (offset + 1) * CLUSTER_SIZE),
        )
        .filter((cluster) => cluster.length > 0);
      if (clusters.length === 0) continue;
      scenarios.push(namingScenario(`map-naming/${script}/${batch}`, language, clusters));
    }
  }
  return scenarios;
}
