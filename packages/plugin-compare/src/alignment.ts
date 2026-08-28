/**
 * Purpose: the semantic-alignment engine's pure logic (spec 024) — candidate generation via
 * local embedding cosine (wide threshold, top-k, double pruning: string-matched items and
 * already-judged pairs never re-enter), the batched LLM judge contract (strict same-concept
 * only, uncertain = different), verdict validation, and the scoring rule (low-confidence
 * "same" never counts). Main exports: generateAlignmentCandidates, buildAlignmentJudgeMessages,
 * alignmentJudgeSchema, validateAlignmentVerdicts, alignmentCountsAsOverlap, chunkPairs,
 * alignmentTextOfItem, ALIGNMENT_CANDIDATE_THRESHOLD, ALIGNMENT_TOP_K, ALIGNMENT_JUDGE_BATCH_SIZE.
 */
import type { ChatMessage } from "@breadcrumb/core-llm";
import { cosineSimilarity, topByRelativeGate } from "@breadcrumb/plugin-knowledge-tree";
import { z } from "zod";
import { leafKeysOf } from "./matching";
import type { ProfileItemDefinition } from "./profileSchema";

/** At most this many candidate nodes per profile leaf enter judgment. */
export const ALIGNMENT_TOP_K = 3;
/** Pairs per judge call — one batched call instead of dozens of small ones. */
export const ALIGNMENT_JUDGE_BATCH_SIZE = 30;

/** The text a profile item is embedded as: its label plus its source-defensible aliases. */
export function alignmentTextOfItem(item: ProfileItemDefinition): string {
  return item.aliases.length === 0 ? item.label : `${item.label}（${item.aliases.join("、")}）`;
}

export interface AlignmentCandidatePair {
  itemKey: string;
  itemLabel: string;
  /** Where the item comes from — disambiguation context for the judge. */
  itemContext: string;
  nodeId: string;
  nodeLabel: string;
  nodeSummary: string;
  similarity: number;
}

/**
 * Deterministic candidate pairs for judgment. Only leaves; items that already string-matched
 * are excluded (nothing to align); pairs already judged (either verdict) are excluded — the
 * crosswalk is asked once per pair, ever. Order: item authored order, then similarity desc.
 *
 * The cutoff is each item's OWN similarity landscape (topByRelativeGate), not a fixed cosine
 * floor. The old ALIGNMENT_CANDIDATE_THRESHOLD = 0.72 passed 100% of pairs on the live
 * database — a blocker with reduction ratio 0 is not a blocker, and it made compare-align the
 * single largest LLM bill in the app for a 0.023% useful-output rate (design audit 2026-08-28
 * #1/#2). With top-k applied AFTER a relative gate, an item whose matches are all equally
 * mediocre now contributes far fewer pairs instead of always contributing exactly k.
 */
export function generateAlignmentCandidates(input: {
  items: readonly ProfileItemDefinition[];
  itemVectors: ReadonlyMap<string, readonly number[]>;
  nodes: readonly { id: string; label: string; summary: string }[];
  nodeVectors: ReadonlyMap<string, readonly number[]>;
  judgedPairs: ReadonlySet<string>;
  matchedItemKeys: ReadonlySet<string>;
}): AlignmentCandidatePair[] {
  const leafKeys = leafKeysOf(input.items);
  const pairs: AlignmentCandidatePair[] = [];
  for (const item of input.items) {
    if (!leafKeys.has(item.key) || input.matchedItemKeys.has(item.key)) continue;
    const itemVector = input.itemVectors.get(item.key);
    if (itemVector === undefined) continue;
    const scored: AlignmentCandidatePair[] = [];
    for (const node of input.nodes) {
      if (input.judgedPairs.has(`${item.key}:${node.id}`)) continue;
      const nodeVector = input.nodeVectors.get(node.id);
      if (nodeVector === undefined) continue;
      const similarity = cosineSimilarity(itemVector, nodeVector);
      scored.push({
        itemKey: item.key,
        itemLabel: alignmentTextOfItem(item),
        itemContext: item.sourceRef,
        nodeId: node.id,
        nodeLabel: node.label,
        nodeSummary: node.summary,
        similarity,
      });
    }
    scored.sort((a, b) => b.similarity - a.similarity || a.nodeId.localeCompare(b.nodeId));
    pairs.push(...topByRelativeGate(scored, ALIGNMENT_TOP_K));
  }
  return pairs;
}

export function chunkPairs<Pair>(pairs: readonly Pair[], size: number): Pair[][] {
  const chunks: Pair[][] = [];
  for (let start = 0; start < pairs.length; start += size) {
    chunks.push(pairs.slice(start, start + size));
  }
  return chunks;
}

export const alignmentJudgeSchema = z.object({
  verdicts: z.array(
    z.object({
      pair: z.number().int().min(1),
      verdict: z.enum(["same", "different"]),
      // ASCII tier (migration 0047): this enum sits inside a JSON contract the model is
      // separately instructed to answer in the learner's language, so a Chinese literal here
      // fought that directive (design audit 2026-08-28, 多语言 B6).
      confidence: z.enum(["high", "medium", "low"]),
      reason: z.string().min(1).max(120),
    }),
  ),
});

export type AlignmentJudgeResult = z.infer<typeof alignmentJudgeSchema>;
export type AlignmentJudgeVerdict = AlignmentJudgeResult["verdicts"][number];

const JUDGE_SYSTEM_PROMPT = `你是一个概念对齐判官。给定若干对条目——A 来自一份公开资料的知识大纲，B 来自一位学习者自己的知识树——逐对判断 A 和 B 是否指同一个知识概念，以 JSON 返回：
{"verdicts":[{"pair":1,"verdict":"same","confidence":"high","reason":"一句话理由，不超过60字"}]}
判定规则（严格执行）：
- 只有当 A 与 B 本质上是同一个概念、名称可以互换时才判 same（例：导数 与 一元函数的导数）
- 仅仅相关、一个是另一个的组成部分、上位或下位概念，都判 different（例：函数 与 闭包；作用域 与 作用域链）
- confidence 三档：high=非常确定，medium=比较确定，low=只是倾向
- 拿不准就判 different
- verdicts 的数量与 pair 序号必须与给出的对一一对应，不许遗漏或多出`;

export function buildAlignmentJudgeMessages(
  pairs: readonly AlignmentCandidatePair[],
): ChatMessage[] {
  const lines = pairs.map(
    (pair, index) =>
      `对${index + 1}：A=${pair.itemLabel}（出处：${pair.itemContext}）｜B=${pair.nodeLabel}${
        pair.nodeSummary.length > 0 ? `（${pair.nodeSummary}）` : ""
      }`,
  );
  return [
    { role: "system", content: JUDGE_SYSTEM_PROMPT },
    { role: "user", content: lines.join("\n") },
  ];
}

/**
 * The whole batch stands or falls together: exactly one verdict per pair, indices covering
 * 1..n. Returns verdicts ordered by pair index, or null (caller discards the batch).
 */
export function validateAlignmentVerdicts(
  pairCount: number,
  result: AlignmentJudgeResult,
): AlignmentJudgeVerdict[] | null {
  if (result.verdicts.length !== pairCount) return null;
  const byIndex = new Map(result.verdicts.map((verdict) => [verdict.pair, verdict]));
  if (byIndex.size !== pairCount) return null;
  const ordered: AlignmentJudgeVerdict[] = [];
  for (let index = 1; index <= pairCount; index += 1) {
    const verdict = byIndex.get(index);
    if (verdict === undefined) return null;
    ordered.push(verdict);
  }
  return ordered;
}

/** Scoring rule (spec 024): only a confident "same" counts as overlap — a low-confidence
 * same is stored but never scored (存疑不记分). */
export function alignmentCountsAsOverlap(verdict: string, confidence: string): boolean {
  return verdict === "same" && confidence !== "low";
}
