/**
 * Purpose: the interest-extraction LLM contract — prompt construction and Zod schema for
 * turning one chat round into per-node curiosity/confusion/boredom anchored-tier signals
 * (plus an overall confidence tier) and preferred explanation-style tags, for every node
 * touched (new or re-sighted) this round.
 * Main exports: interestSignalsSchema, buildInterestMessages, InterestExtractionNode,
 * interestLevelSchema, confidenceLevelSchema, INTEREST_LEVEL_SCORES, CONFIDENCE_LEVEL_SCORES.
 */
import type { ChatMessage } from "@breadcrumb/core-llm";
import { z } from "zod";

export interface InterestExtractionNode {
  nodeId: string;
  /** Echoed back by the model to map a signal back to its node unambiguously. */
  label: string;
}

/** Anchored intensity tier for one interest dimension — the model picks a labeled level
 * instead of a bare float, for cross-call consistency (spec 014). */
export const interestLevelSchema = z.enum(["无", "弱", "中", "强"]);
export type InterestLevel = z.infer<typeof interestLevelSchema>;

/** How sure the model is about this whole signal read — low confidence still participates
 * in aggregation (down-weighted, never dropped; see plugin-interest/aggregate.ts). */
export const confidenceLevelSchema = z.enum(["低", "中", "高"]);
export type ConfidenceLevel = z.infer<typeof confidenceLevelSchema>;

/** Tier → number mapping, applied in code right after parsing — the DB and every downstream
 * consumer only ever see plain 0..1 floats. */
export const INTEREST_LEVEL_SCORES: Record<InterestLevel, number> = {
  无: 0,
  弱: 0.3,
  中: 0.6,
  强: 0.9,
};
export const CONFIDENCE_LEVEL_SCORES: Record<ConfidenceLevel, number> = {
  低: 0.3,
  中: 0.6,
  高: 0.9,
};

export const interestSignalsSchema = z.object({
  signals: z
    .array(
      z.object({
        /** Must exactly match a given node's label. */
        label: z.string().min(1),
        curiosity: interestLevelSchema,
        confusion: interestLevelSchema,
        boredom: interestLevelSchema,
        confidence: confidenceLevelSchema,
        /** e.g. "类比" / "代码示例" / "形式化推导"; empty when nothing was actually shown. */
        styles: z.array(z.string().min(1).max(20)).max(5),
      }),
    )
    .max(10),
});

export type InterestSignalsResult = z.infer<typeof interestSignalsSchema>;
export type ExtractedInterestSignal = InterestSignalsResult["signals"][number];

const SYSTEM_PROMPT = `你是一个学习心理观察者。给定学习者与 AI 的一轮问答，以及这一轮踩过的知识点列表，
为每个知识点判断学习者流露出的心理信号，以 JSON 返回：
{"signals":[{"label":"知识点原名(与给定列表完全一致)","curiosity":"无|弱|中|强","confusion":"无|弱|中|强","boredom":"无|弱|中|强","confidence":"低|中|高","styles":["偏好的解释方式标签"]}]}
规则：
- label 必须精确等于给定列表中的原名，用于回填对应节点；给定列表里的每个节点都要出现在结果里，不要遗漏
- curiosity（好奇）分档：强=主动追问、举一反三、明确说想深入了解；中=有一定探索表现；弱=偶尔流露兴趣、一带而过；无=没有表现
- confusion（困惑）分档：强=反复问同一点、逻辑卡住、明确说"没懂"／"还是不太明白"；中=有疑惑但基本能跟上；弱=轻微迟疑；无=顺畅理解
- boredom（厌倦）分档：强=明确想跳过、不耐烦，尤其是简短催促式回应——"懂了懂了""别讲概念""直接来例子""行吧行吧""知道了知道了"这类打断讲解节奏、跳过铺垫的话，即使语气不激烈也算强；中/弱=程度较轻的类似表现；无=没有这类迹象。
  区分"不耐烦/敷衍"与"高效投入"：如果简短是因为已经掌握、直接给出正确答案或精准追问下一步（内容有实质推进），这是高效投入，不算 boredom
- confidence（把握度）分档：高=信号明确、证据充分；中=有信号但不够典型；低=信号模糊、更多是推测——宁可标低也不要装作确定
- styles：仅当对话里确实用了某种解释方式且学习者对此有正面反应时才填（如"类比""代码示例""形式化推导""生活场景""图示"），宁可留空数组也不要臆测
- 没有任何明显信号的知识点：curiosity/confusion/boredom 都填"无"，confidence 按你的实际把握程度填，styles 填空数组
- 若这一轮完全没有心理信号可辨（如纯寒暄），返回 {"signals":[]}`;

export function buildInterestMessages(
  nodes: readonly InterestExtractionNode[],
  userQuestion: string,
  assistantAnswer: string,
): ChatMessage[] {
  const nodesText = nodes.map((node) => `- ${node.label}`).join("\n");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `本轮踩过的知识点：\n${nodesText}\n\n本轮问答：\n【问】${userQuestion}\n【答】${assistantAnswer}`,
    },
  ];
}
