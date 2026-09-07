/**
 * Purpose: the gold-standard prerequisite baseline (`sim gold` subcommand) —
 * feeds every hand-authored pair in data/gold-prerequisites.json through the real edge-judge
 * LLM contract and reports direction accuracy on 'requires' pairs plus the unrelated-rejection
 * rate on 'unrelated' pairs. No pass threshold: this is a baseline measurement, not a gate.
 * Pairs carry the language they are written in, and the one-line summary handed to the judge
 * alongside each label is written in that same language. Feeding a Bengali label to the judge
 * under a Chinese summary measures the judge's tolerance for mixed-language input, not its
 * accuracy.
 * Main exports: loadGoldPairs, runGoldBaseline, GoldBaselineResult, GOLD_PAIRS_PATH,
 * summariseConcept.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chatJson, type LlmClientConfig } from "@breadcrumb/core-llm";
import {
  buildEdgeJudgeMessages,
  type EdgeJudgeCandidatePair,
  edgeJudgeSchema,
  type PairJudgement,
} from "@breadcrumb/feature-graph";
import { z } from "zod";

export const GOLD_PAIRS_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "data",
  "gold-prerequisites.json",
);

const goldFileSchema = z.object({
  pairs: z.array(
    z.object({
      /** BCP-47 tag both labels are written in. */
      lang: z.string().min(2),
      a: z.string(),
      b: z.string(),
      relation: z.enum(["requires", "unrelated"]),
    }),
  ),
});

/** "<label> is a concept" in each language the gold set covers. The judge only needs enough
 * of a summary to know the label is a topic and not a stray string, so one sentence per
 * language is the whole requirement. */
const SUMMARY_TEMPLATES: Readonly<Record<string, (label: string) => string>> = {
  "zh-CN": (label) => `${label} 是一个知识点`,
  en: (label) => `${label} is a concept in this subject`,
  es: (label) => `${label} es un concepto de esta materia`,
  id: (label) => `${label} adalah sebuah konsep dalam mata pelajaran ini`,
  ru: (label) => `${label} — понятие из этого предмета`,
  hi: (label) => `${label} इस विषय की एक अवधारणा है।`,
  ar: (label) => `${label} مفهوم في هذه المادة`,
  bn: (label) => `${label} এই বিষয়ের একটি ধারণা।`,
  ja: (label) => `${label}はこの分野の概念です`,
  ko: (label) => `${label}은(는) 이 분야의 개념입니다`,
};

/** Falls back to English rather than Chinese for a language with no template: an English
 * sentence around a Bengali label is at least not claiming the label is Chinese. */
export function summariseConcept(label: string, lang: string): string {
  const template = SUMMARY_TEMPLATES[lang] ?? SUMMARY_TEMPLATES.en;
  if (template === undefined) throw new Error("summariseConcept: no English template");
  return template(label);
}
export type GoldPair = z.infer<typeof goldFileSchema>["pairs"][number];

const BATCH_SIZE = 20; // edgeJudgeSchema.edges is capped at 20 per call

export function loadGoldPairs(path: string = GOLD_PAIRS_PATH): GoldPair[] {
  return goldFileSchema.parse(JSON.parse(readFileSync(path, "utf-8"))).pairs;
}

export interface GoldBaselineResult {
  totalPairs: number;
  requiresCount: number;
  unrelatedCount: number;
  directionAccuracy: number;
  unrelatedRejectionRate: number;
  judged: {
    pairId: string;
    a: string;
    b: string;
    expected: GoldPair["relation"];
    judgement: PairJudgement;
  }[];
}

function chunk<Item>(items: readonly Item[], size: number): Item[][] {
  if (size <= 0) throw new Error(`chunk: size must be positive, got ${size}`);
  const chunks: Item[][] = [];
  for (let index = 0; index < items.length; index += size)
    chunks.push(items.slice(index, index + size));
  return chunks;
}

/** Direction is correct when the judge says "requires" and picks the direction that puts
 * `a` (the documented prerequisite) as the source. */
function isCorrectDirection(judgement: PairJudgement): boolean {
  return judgement.relation === "requires" && judgement.direction === "aToB";
}

export async function runGoldBaseline(
  llmConfig: LlmClientConfig,
  pairs: readonly GoldPair[] = loadGoldPairs(),
): Promise<GoldBaselineResult> {
  const judged: GoldBaselineResult["judged"] = [];

  for (const batch of chunk(pairs, BATCH_SIZE)) {
    const candidates: EdgeJudgeCandidatePair[] = batch.map((pair, index) => ({
      pairId: `g${index}`,
      nodeALabel: pair.a,
      nodeASummary: summariseConcept(pair.a, pair.lang),
      nodeBLabel: pair.b,
      nodeBSummary: summariseConcept(pair.b, pair.lang),
    }));
    const { parsed } = await chatJson(
      llmConfig,
      buildEdgeJudgeMessages(candidates),
      edgeJudgeSchema,
    );
    const judgementByPairId = new Map(parsed.edges.map((edge) => [edge.pairId, edge]));

    batch.forEach((pair, index) => {
      const pairId = `g${index}`;
      const judgement = judgementByPairId.get(pairId) ?? {
        pairId,
        relation: "unrelated" as const,
        direction: null,
        weight: null,
        confidence: 0,
        reasoning: "(model returned no judgement for this pair)",
      };
      judged.push({ pairId, a: pair.a, b: pair.b, expected: pair.relation, judgement });
    });
  }

  const requiresPairs = judged.filter((j) => j.expected === "requires");
  const unrelatedPairs = judged.filter((j) => j.expected === "unrelated");
  const directionAccuracy =
    requiresPairs.length === 0
      ? 0
      : requiresPairs.filter((j) => isCorrectDirection(j.judgement)).length / requiresPairs.length;
  const unrelatedRejectionRate =
    unrelatedPairs.length === 0
      ? 0
      : unrelatedPairs.filter((j) => j.judgement.relation === "unrelated").length /
        unrelatedPairs.length;

  return {
    totalPairs: judged.length,
    requiresCount: requiresPairs.length,
    unrelatedCount: unrelatedPairs.length,
    directionAccuracy,
    unrelatedRejectionRate,
    judged,
  };
}
