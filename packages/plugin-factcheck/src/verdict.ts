/**
 * Purpose: the verdict contract — prompt and Zod schema for judging one claim against
 * gathered evidence, with learner-facing plain, non-accusatory reasoning, and the citation
 * anchoring that says *which* pieces of evidence carried the judgement.
 * Main exports: createVerdictSchema, buildVerdictMessages, ClaimRelationship.
 */
import type { ChatMessage } from "@breadcrumb/core-llm";
import { z } from "zod";
import type { EvidenceItem } from "./evidence/provider";

/**
 * The judge's own three-way answer. FEVER's standard label set, deliberately under-claiming
 * in the wording it produces ("找到了佐证", never "属实").
 */
export const VERDICT_RELATIONSHIPS = ["supported", "contradicted", "insufficient"] as const;
export type VerdictRelationship = (typeof VERDICT_RELATIONSHIPS)[number];

/**
 * What a checked claim can end up as. `unavailable` never comes from the judge — the pipeline
 * assigns it when evidence retrieval itself failed, so that "我这次没查成" is never rendered
 * as "公开资料里没有" (深度设计审计 2026-08-28, 差距 2).
 */
export type ClaimRelationship = VerdictRelationship | "unavailable";

/**
 * The verdict schema for a claim judged against exactly `evidenceCount` items. Built per
 * call because `supportingEvidence` is 1-based into *that* list: a citation index outside the
 * material is a hallucinated citation and must not survive the boundary.
 */
export function createVerdictSchema(evidenceCount: number) {
  const highestIndex = Math.max(evidenceCount, 1);
  return z.object({
    /** One plain, matter-of-fact sentence explaining the judgement, e.g. "资料显示…". */
    reasoning: z.string().min(1).max(200),
    relationship: z.enum(VERDICT_RELATIONSHIPS),
    /** 1-based indices of the evidence items the judgement rests on. Defaulted rather than
     * required: a missing citation list is a weaker answer, not a reason to discard a
     * verdict the user is waiting for. */
    supportingEvidence: z
      .array(z.number().int().min(1).max(highestIndex))
      .max(highestIndex)
      .default([]),
  });
}

const SYSTEM_PROMPT = `你是事实核查判定器。给定一条声明与检索到的资料摘录，判断资料与声明的关系，以 JSON 返回：
{"reasoning":"一句话说明判断依据（中文、平实客观、只谈资料与声明本身）","relationship":"supported | contradicted | insufficient","supportingEvidence":[被用到的资料编号]}
规则：
- supported：资料实质性支持声明；contradicted：资料与声明存在实质冲突；insufficient：资料不足以判断
- supportingEvidence 只填真正支撑你这个结论的资料编号（如 [1,3]）；没有任何一条真正相关就填 []
- 资料编号的顺序不代表相关性，逐条读完再判断
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
