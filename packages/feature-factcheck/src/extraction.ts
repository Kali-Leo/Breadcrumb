/**
 * Purpose: the claim-extraction contract — prompt and Zod schema for turning one chat round
 * into check-worthy factual claims with search queries (Loki's decompose+checkworthy+query
 * steps merged into a single call). Main exports: claimExtractionSchema, buildClaimExtractionMessages.
 */
import type { ChatMessage } from "@breadcrumb/core-llm";
import { z } from "zod";

export const claimExtractionSchema = z.object({
  claims: z
    .array(
      z.object({
        /** Atomic, self-contained factual claim from the assistant answer. */
        text: z.string().min(1).max(120),
        /** 1-2 search queries most likely to hit authoritative sources. */
        queries: z.array(z.string().min(1).max(80)).min(1).max(2),
      }),
    )
    .max(4),
});

export type ExtractedClaim = z.infer<typeof claimExtractionSchema>["claims"][number];

const SYSTEM_PROMPT = `你是学习对话的事实核查前哨。给定学习者与 AI 的一轮问答，从 AI 的回答中提取"值得核查的客观事实性声明"（0~4 条，宁缺毋滥），以 JSON 返回：
{"claims":[{"text":"原子化声明（一句话、自包含、≤40字）","queries":["检索查询1","检索查询2（可选）"]}]}
规则：
- 只提取可被公开资料证实或证伪的客观事实（数字、日期、人物、事件、定义、机制）
- 观点、建议、代码示例、数学推导、比喻、常识性废话不提取
- 每条声明必须自包含：不用"它/这个"等指代词，补全主语
- 为每条声明生成 2 个检索查询：用"关键词组合"而非完整句子（如：光速 数值 299792458），
  必须包含声明中最具区分度的数字、术语或人名；两条查询角度错开（如中文一条、英文一条）
- 回答若不含可核查事实，返回 {"claims":[]}`;

export function buildClaimExtractionMessages(
  userQuestion: string,
  assistantAnswer: string,
): ChatMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `本轮问答：\n【问】${userQuestion}\n【答】${assistantAnswer}` },
  ];
}
