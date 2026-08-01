/**
 * Purpose: the self-report mapping LLM contract — prompt construction and Zod schema for
 * turning free text like "我学过高中数学" into a subset of the user's EXISTING knowledge-tree
 * node labels, each tagged with a claim strength. Never invents labels.
 * Main exports: selfReportMappingSchema, buildSelfReportMessages, SelfReportMapping.
 */
import type { ChatMessage } from "@breadcrumb/core-llm";
import { z } from "zod";

export const selfReportMappingSchema = z.object({
  mappings: z
    .array(
      z.object({
        /** Must exactly match one of the given existing node labels. */
        label: z.string().min(1),
        /** "learned" = explicitly says learned/mastered it; "familiar" = only heard of it. */
        claimLevel: z.enum(["learned", "familiar"]),
      }),
    )
    .max(30),
});

export type SelfReportMappingResult = z.infer<typeof selfReportMappingSchema>;
export type SelfReportMapping = SelfReportMappingResult["mappings"][number];

const SYSTEM_PROMPT = `你是一个自报知识映射器。学习者会用自然语言描述自己学过/熟悉的内容，你需要把它映射到
「已有知识点列表」上的节点，以 JSON 返回：
{"mappings":[{"label":"已有节点原名(必须完全等于列表中的一个)","claimLevel":"learned|familiar"}]}
规则：
- label 只能从已有知识点列表中原样选取，绝不允许发明不存在的节点名，哪怕语义上很接近
- claimLevel："learned" = 明确说学过/掌握了/用过；"familiar" = 只是听说过/大致了解，没到学过的程度
- 一段描述可能对应多个已有节点，都列出来；找不到任何匹配节点时返回 {"mappings":[]}，宁缺毋滥，不要牵强匹配`;

export function buildSelfReportMessages(
  userText: string,
  existingNodeLabels: readonly string[],
): ChatMessage[] {
  const listText =
    existingNodeLabels.length === 0
      ? "（空树）"
      : existingNodeLabels.map((label) => `- ${label}`).join("\n");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `已有知识点列表：\n${listText}\n\n学习者的自我描述：\n${userText}` },
  ];
}
