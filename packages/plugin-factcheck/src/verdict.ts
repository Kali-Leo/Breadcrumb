/**
 * Purpose: the verdict contract — prompt and Zod schema for judging one claim against
 * gathered evidence, with learner-facing plain, non-accusatory reasoning.
 * Main exports: verdictSchema, buildVerdictMessages, ClaimRelationship.
 */
import type { ChatMessage } from "@breadcrumb/core-llm";
import { z } from "zod";
import type { EvidenceItem } from "./evidence/provider";

export const verdictSchema = z.object({
  /** One plain, matter-of-fact Chinese sentence explaining the judgement, e.g. "资料显示…". */
  reasoning: z.string().min(1).max(200),
  relationship: z.enum(["supported", "contradicted", "insufficient"]),
});

export type ClaimRelationship = z.infer<typeof verdictSchema>["relationship"];

const SYSTEM_PROMPT = `你是事实核查判定器。给定一条声明与检索到的资料摘录，判断资料与声明的关系，以 JSON 返回：
{"reasoning":"一句话说明判断依据（中文、平实客观、只谈资料与声明本身）","relationship":"supported | contradicted | insufficient"}
规则：
- supported：资料实质性支持声明；contradicted：资料与声明存在实质冲突；insufficient：资料不足以判断
- 只依据给出的资料判断，不要用你自己的知识补充
- reasoning 面向学习者，用"资料显示…"的口吻；永远不说"AI 错了"或"你学错了"`;

export function buildVerdictMessages(
  claimText: string,
  evidence: readonly EvidenceItem[],
): ChatMessage[] {
  const evidenceText = evidence
    .map(
      (item, index) =>
        `[${index + 1}]（${item.source}）${item.title}\n${item.url}\n${item.snippet}`,
    )
    .join("\n\n");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `声明：${claimText}\n\n资料摘录：\n${evidenceText}` },
  ];
}
