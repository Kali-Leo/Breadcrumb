/**
 * Purpose: the edge-judge LLM contract — prompt construction and Zod schema for turning a
 * batch of candidate (new node, existing node) pairs into requires/helps relationship
 * judgments (helps weight as an anchored tier), plus optional proposals of new learning-
 * method nodes and, in casual mode only (spec 016), 0~2 adjacent-unlearned-concept
 * proposals that give frontier() a real, sighting-free "ahead".
 * Main exports: edgeJudgeSchema, buildEdgeJudgeMessages, EdgeJudgeCandidatePair,
 * helpsWeightLevelSchema, HELPS_WEIGHT_SCORES, BuildEdgeJudgeMessagesOptions.
 */
import type { ChatMessage } from "@breadcrumb/core-llm";
import { z } from "zod";

export interface EdgeJudgeCandidatePair {
  /** Opaque, stable per batch (e.g. "p0") so the model can echo it back unambiguously. */
  pairId: string;
  nodeALabel: string;
  nodeASummary: string;
  nodeBLabel: string;
  nodeBSummary: string;
}

/** Anchored helps-strength tier — the model picks a labeled level instead of a bare float,
 * for cross-call consistency (spec 014). requires edges have no tier: their weight is
 * always 1, assigned by the system. */
/** ASCII values (design audit 2026-08-28, 多语言 B6): the tier travels inside a JSON contract
 * the model is separately instructed to answer in the learner's language, so a Chinese
 * literal here fights that directive. The prompt still explains each tier in prose. */
export const helpsWeightLevelSchema = z.enum(["weak", "medium", "strong"]);
export type HelpsWeightLevel = z.infer<typeof helpsWeightLevelSchema>;

/** Tier → number mapping, applied in code right after parsing — the DB only ever sees a
 * plain 0..1 float. */
export const HELPS_WEIGHT_SCORES: Record<HelpsWeightLevel, number> = {
  weak: 0.3,
  medium: 0.6,
  strong: 0.9,
};

export const edgeJudgeSchema = z.object({
  edges: z
    .array(
      z.object({
        pairId: z.string().min(1),
        relation: z.enum(["unrelated", "requires", "helps"]),
        /** Only meaningful when relation is "requires": "aToB" = A is prerequisite of B. */
        direction: z.enum(["aToB", "bToA"]).nullable(),
        /** Only meaningful when relation is "helps". */
        weight: helpsWeightLevelSchema.nullable(),
        confidence: z.number().min(0).max(1),
        // No rationale field: nothing reads one, and asking for it after the verdict fields
        // buys no reasoning either — those tokens are emitted once the decision is already
        // made. If a rationale is ever wanted as scaffolding it has to come FIRST, and then
        // it has to earn its output tokens (billed at 3x input).
      }),
    )
    .max(20),
  methodNodes: z
    .array(
      z.object({
        /** e.g. "费曼技巧" — a learning technique, not a curriculum concept. */
        label: z.string().min(1).max(40),
        summary: z.string().min(1).max(200),
        /** Labels (existing or among this batch's nodes) this method helps understand. */
        helpsLabels: z.array(z.string().min(1).max(40)).min(1).max(5),
        weight: helpsWeightLevelSchema,
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(3),
  /** Casual-mode-only proposals (spec 016): concepts strongly related to this round's
   * content, not yet touched by the learner, worth exploring next — inserted with no
   * sighting so they stay genuinely unlit. Ranked mode's prompt omits the section that asks
   * for these, so the model naturally omits the key too; .default([]) keeps the schema total
   * either way instead of requiring every ranked-mode caller to pass an empty array. */
  adjacentConcepts: z
    .array(
      z.object({
        label: z.string().min(1).max(40),
        summary: z.string().min(1).max(200),
        /** Must echo a label already known this batch (an existing node or one of the pairs'
         * A/B labels) — the concept it's adjacent to. */
        connectsToLabel: z.string().min(1).max(40),
        /** How much connectsToLabel helps understand this new concept. */
        helpsLevel: helpsWeightLevelSchema,
      }),
    )
    .max(2)
    .default([]),
});

export type EdgeJudgeResult = z.infer<typeof edgeJudgeSchema>;
export type PairJudgement = EdgeJudgeResult["edges"][number];

const BASE_SYSTEM_PROMPT = `你是一个知识关系判定器。给定若干候选知识点对（A、B），为每一对判定它们的学习结构关系，以 JSON 返回：
{"edges":[{"pairId":"候选对编号(原样返回)","relation":"unrelated|requires|helps","direction":"aToB|bToA 或 null","weight":"weak|medium|strong 或 null,"confidence":0~1的数字}],
 "methodNodes":[{"label":"学习方法短名(如 费曼技巧)","summary":"这个方法是什么(一句话)","helpsLabels":["它能帮助理解的已有或候选知识点原名"],"weight":"weak|medium|strong","confidence":0~1}]}
判定规则：
- unrelated：两者没有直接学习结构关系
- requires：其中一个是另一个的硬前置（不学会 A 就学不懂 B），direction 用 "aToB" 表示 A 是 B 的前置，"bToA" 反之；weight 填 null（requires 恒为 1，由系统赋值）
- helps：两者有辅助理解关系但不是硬前置（如类比、对比、同一场景下的互补概念），weight 分档：strong=没有这个辅助基本学不明白；medium=有帮助但不是必需；weak=锦上添花，聊胜于无
- confidence 是你对这个判定的把握程度，宁可判 unrelated 也不要牵强判定
- methodNodes 是可选的：如果这批知识点让你联想到一个通用学习方法（如"费曼技巧""间隔重复"），可以提议，最多 3 个，宁缺毋滥；否则返回空数组`;

/** Casual-mode-only addition (spec 016): invites 0~2 adjacent-unlearned-concept proposals.
 * Ranked mode never includes this section — its prompt doesn't ask, so its edgeJudgeSchema
 * output naturally omits the key (defaulted to [] by the schema). */
const CASUAL_ADJACENT_CONCEPTS_SECTION = `
你还可以在下面追加 0~2 个"相邻未学概念"：与本批次知识点强相关、学习者显然还没接触过、
值得作为下一步探索方向的新概念（不是这批知识点本身，也不是纯粹的同义词）：
{"adjacentConcepts":[{"label":"新概念短名","summary":"这个概念是什么(一句话)","connectsToLabel":"本批次中与它关系最紧密的知识点原名(A、B 之一)","helpsLevel":"weak|medium|strong，即 connectsToLabel 对理解这个新概念的帮助程度"}]}
宁缺毋滥，不确定就不要提议，找不到就返回空数组。`;

function buildSystemPrompt(casual: boolean): string {
  if (!casual) {
    return `${BASE_SYSTEM_PROMPT}
- 若没有任何一对存在关系，也没有值得提议的学习方法，返回 {"edges":[],"methodNodes":[]}`;
  }
  return `${BASE_SYSTEM_PROMPT}
${CASUAL_ADJACENT_CONCEPTS_SECTION}
- 若没有任何一对存在关系、没有值得提议的学习方法、也没有值得提议的相邻概念，返回 {"edges":[],"methodNodes":[],"adjacentConcepts":[]}`;
}

export interface BuildEdgeJudgeMessagesOptions {
  /** True in casual mode: adds the adjacent-unlearned-concept prompt section (spec 016).
   * Defaults to false (ranked-mode behavior) so every existing call site — including
   * packages/simlab's edgeJudgeStage.ts — keeps compiling and behaving unchanged. */
  casual?: boolean;
}

export function buildEdgeJudgeMessages(
  pairs: readonly EdgeJudgeCandidatePair[],
  options: BuildEdgeJudgeMessagesOptions = {},
): ChatMessage[] {
  const pairsText = pairs
    .map(
      (pair) =>
        `[${pair.pairId}] A「${pair.nodeALabel}」(${pair.nodeASummary}) vs B「${pair.nodeBLabel}」(${pair.nodeBSummary})`,
    )
    .join("\n");
  return [
    { role: "system", content: buildSystemPrompt(options.casual ?? false) },
    { role: "user", content: `候选知识点对：\n${pairsText}` },
  ];
}
