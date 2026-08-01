/**
 * Purpose: the gold-standard prerequisite baseline (spec 013 T4, `sim gold` subcommand) —
 * feeds every hand-authored pair in data/gold-prerequisites.json through the real edge-judge
 * LLM contract and reports direction accuracy on 'requires' pairs plus the unrelated-rejection
 * rate on 'unrelated' pairs. No pass threshold: this is a baseline measurement, not a gate.
 * Main exports: loadGoldPairs, runGoldBaseline, GoldBaselineResult, GOLD_PAIRS_PATH.
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
} from "@breadcrumb/plugin-graph";
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
    z.object({ a: z.string(), b: z.string(), relation: z.enum(["requires", "unrelated"]) }),
  ),
});
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
      nodeASummary: `${pair.a} 是一个知识点`,
      nodeBLabel: pair.b,
      nodeBSummary: `${pair.b} 是一个知识点`,
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
