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
 * instead of a bare float, for cross-call consistency (spec 014).
 *
 * ASCII values (design audit 2026-08-28, 多语言 B6; same fix as plugin-graph's
 * helpsWeightLevelSchema): jsonClient appends an answer-language directive to every call, so a
 * learner on English gets a model that dutifully replies "none"/"weak" — against a Chinese
 * literal that is a Zod failure, a retry, a second failure, and interest extraction silently
 * going dark. The prompt still explains each tier in prose. */
export const interestLevelSchema = z.enum(["none", "weak", "medium", "strong"]);
export type InterestLevel = z.infer<typeof interestLevelSchema>;

/** How sure the model is about this whole signal read — low confidence still participates
 * in aggregation (down-weighted, never dropped; see plugin-interest/aggregate.ts). ASCII for
 * the same reason as interestLevelSchema. */
export const confidenceLevelSchema = z.enum(["low", "medium", "high"]);
export type ConfidenceLevel = z.infer<typeof confidenceLevelSchema>;

/** Tier → number mapping, applied in code right after parsing — the DB and every downstream
 * consumer only ever see plain 0..1 floats, so renaming the tiers needs no data migration. */
export const INTEREST_LEVEL_SCORES: Record<InterestLevel, number> = {
  none: 0,
  weak: 0.3,
  medium: 0.6,
  strong: 0.9,
};
export const CONFIDENCE_LEVEL_SCORES: Record<ConfidenceLevel, number> = {
  low: 0.3,
  medium: 0.6,
  high: 0.9,
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
{"signals":[{"label":"知识点原名(与给定列表完全一致)","curiosity":"none|weak|medium|strong","confusion":"none|weak|medium|strong","boredom":"none|weak|medium|strong","confidence":"low|medium|high","styles":["偏好的解释方式标签"]}]}
档位值必须原样使用上面这些 ASCII 英文词，不要翻译成中文或其他语言。
规则：
- label 必须精确等于给定列表中的原名，用于回填对应节点；给定列表里的每个节点都要出现在结果里，不要遗漏
- curiosity（好奇）分档：strong=主动追问、举一反三、明确说想深入了解；medium=有一定探索表现；weak=偶尔流露兴趣、一带而过；none=没有表现
- confusion（困惑）分档：strong=反复问同一点、逻辑卡住、明确说"没懂"／"还是不太明白"；medium=有疑惑但基本能跟上；weak=轻微迟疑；none=顺畅理解
- boredom（厌倦）分档：只有内容层面的证据才够得上 medium/strong——
  strong=明确说要跳过这个知识点／明确说不想继续这个话题，或在同一轮里反复表达不耐烦；
  medium=主动把话题转到别处，或明确要求换一种讲法／换一个方向；
  weak=只有语气上的轻微迹象，没有内容证据；none=没有迹象。
  回复简短本身不是证据，最多算 weak 且 confidence 填 low：简短可能是这个人的表达习惯、可能是已经懂了、
  也可能只是应答（中文里"知道了""行吧""好的"常常只是接话）。不要因为一句话短就判成厌倦
- confidence（把握度）分档：high=信号明确、证据充分；medium=有信号但不够典型；low=信号模糊、更多是推测——宁可标 low 也不要装作确定
- styles：仅当对话里确实用了某种解释方式且学习者对此有正面反应时才填（如"类比""代码示例""形式化推导""生活场景""图示"），宁可留空数组也不要臆测
- 没有任何明显信号的知识点：curiosity/confusion/boredom 都填 none，confidence 按你的实际把握程度填，styles 填空数组
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
