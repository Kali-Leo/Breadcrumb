/**
 * Purpose: the edge-judge LLM contract — prompt construction and Zod schema for turning a
 * batch of candidate (new node, existing node) pairs into requires/helps relationship
 * judgments, plus optional proposals of new learning-method nodes.
 * Main exports: edgeJudgeSchema, buildEdgeJudgeMessages, EdgeJudgeCandidatePair.
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

export const edgeJudgeSchema = z.object({
  edges: z
    .array(
      z.object({
        pairId: z.string().min(1),
        relation: z.enum(["unrelated", "requires", "helps"]),
        /** Only meaningful when relation is "requires": "aToB" = A is prerequisite of B. */
        direction: z.enum(["aToB", "bToA"]).nullable(),
        /** Only meaningful when relation is "helps": 0 (barely) ~ 1 (essential). */
        weight: z.number().min(0).max(1).nullable(),
        confidence: z.number().min(0).max(1),
        reasoning: z.string().min(1).max(200),
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
        helpsLabels: z.array(z.string().min(1)).min(1).max(5),
        weight: z.number().min(0).max(1),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(3),
});

export type EdgeJudgeResult = z.infer<typeof edgeJudgeSchema>;
export type PairJudgement = EdgeJudgeResult["edges"][number];
export type MethodNodeProposal = EdgeJudgeResult["methodNodes"][number];

const SYSTEM_PROMPT = `你是一个知识关系判定器。给定若干候选知识点对（A、B），为每一对判定它们的学习结构关系，以 JSON 返回：
{"edges":[{"pairId":"候选对编号(原样返回)","relation":"unrelated|requires|helps","direction":"aToB|bToA 或 null","weight":0~1的数字或 null,"confidence":0~1的数字,"reasoning":"一句话理由"}],
 "methodNodes":[{"label":"学习方法短名(如 费曼技巧)","summary":"这个方法是什么(一句话)","helpsLabels":["它能帮助理解的已有或候选知识点原名"],"weight":0~1,"confidence":0~1}]}
判定规则：
- unrelated：两者没有直接学习结构关系
- requires：其中一个是另一个的硬前置（不学会 A 就学不懂 B），direction 用 "aToB" 表示 A 是 B 的前置，"bToA" 反之；weight 填 null（requires 恒为 1，由系统赋值）
- helps：两者有辅助理解关系但不是硬前置（如类比、对比、同一场景下的互补概念），weight 表示帮助程度，reasoning 说明为什么
- confidence 是你对这个判定的把握程度，宁可判 unrelated 也不要牵强判定
- methodNodes 是可选的：如果这批知识点让你联想到一个通用学习方法（如"费曼技巧""间隔重复"），可以提议，最多 3 个，宁缺毋滥；否则返回空数组
- 若没有任何一对存在关系，也没有值得提议的学习方法，返回 {"edges":[],"methodNodes":[]}`;

export function buildEdgeJudgeMessages(pairs: readonly EdgeJudgeCandidatePair[]): ChatMessage[] {
  const pairsText = pairs
    .map(
      (pair) =>
        `[${pair.pairId}] A「${pair.nodeALabel}」(${pair.nodeASummary}) vs B「${pair.nodeBLabel}」(${pair.nodeBSummary})`,
    )
    .join("\n");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `候选知识点对：\n${pairsText}` },
  ];
}
