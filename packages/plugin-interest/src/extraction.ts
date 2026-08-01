/**
 * Purpose: the interest-extraction LLM contract — prompt construction and Zod schema for
 * turning one chat round into per-node curiosity/confusion/boredom signals and preferred
 * explanation-style tags, for every node touched (new or re-sighted) this round.
 * Main exports: interestSignalsSchema, buildInterestMessages, InterestExtractionNode.
 */
import type { ChatMessage } from "@breadcrumb/core-llm";
import { z } from "zod";

export interface InterestExtractionNode {
  nodeId: string;
  /** Echoed back by the model to map a signal back to its node unambiguously. */
  label: string;
}

export const interestSignalsSchema = z.object({
  signals: z
    .array(
      z.object({
        /** Must exactly match a given node's label. */
        label: z.string().min(1),
        curiosity: z.number().min(0).max(1),
        confusion: z.number().min(0).max(1),
        boredom: z.number().min(0).max(1),
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
{"signals":[{"label":"知识点原名(与给定列表完全一致)","curiosity":0~1,"confusion":0~1,"boredom":0~1,"styles":["偏好的解释方式标签"]}]}
规则：
- label 必须精确等于给定列表中的原名，用于回填对应节点；给定列表里的每个节点都要出现在结果里，不要遗漏
- curiosity（好奇）：主动追问、举一反三、明确说想深入了解
- confusion（困惑）：反复问同一点、说"没懂"/"还是不太明白"、逻辑卡住
- boredom（厌倦）：敷衍作答、明确想跳过、表现出不耐烦；尤其注意简短催促式回应——"懂了懂了""别讲概念""直接来例子""行吧行吧""知道了知道了"这类话是在打断讲解节奏、
  跳过铺垫，即使语气不激烈也要计入 boredom > 0，不要因为回复简短就当作 0
- 区分"不耐烦/敷衍"与"高效但投入"：如果学习者简短是因为已经掌握、直接给出正确答案或精准追问下一步（内容有实质推进），
  这是高效投入，不算 boredom；如果简短是在打断、催促跳过讲解本身（不管内容对错），才算 boredom
- styles：仅当对话里确实用了某种解释方式且学习者对此有正面反应时才填（如"类比""代码示例""形式化推导""生活场景""图示"），宁可留空数组也不要臆测
- 没有任何明显信号的知识点：三项都填 0，styles 填空数组
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
