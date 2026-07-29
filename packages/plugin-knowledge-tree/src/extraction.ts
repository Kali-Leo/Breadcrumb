/**
 * Purpose: the extraction contract — prompt construction and Zod schema for turning one
 * chat round (question + answer) into knowledge-node operations against the existing tree.
 * Main exports: extractionResponseSchema, buildExtractionMessages, ExtractedNode.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import type { ChatMessage } from "@breadcrumb/core-llm";
import { z } from "zod";

export const extractionResponseSchema = z.object({
  nodes: z
    .array(
      z.object({
        /** Short node name, e.g. "闭包" — used as the tree label. */
        label: z.string().min(1).max(40),
        /** One-sentence takeaway of what was learned about it in this round. */
        summary: z.string().min(1).max(200),
        /** Label of an existing node (or of another node in this batch) to attach under; null = root. */
        parentLabel: z.string().nullable(),
      }),
    )
    .max(5),
});

export type ExtractedNode = z.infer<typeof extractionResponseSchema>["nodes"][number];

const SYSTEM_PROMPT = `你是一个知识结构提取器。给定学习者与 AI 的一轮问答，以及该会话已有的知识树，
提取这一轮真正«新学到»的知识点（0~3 个，宁缺毋滥），以 JSON 返回：
{"nodes":[{"label":"知识点短名(≤12字)","summary":"这一轮学到了什么(一句话)","parentLabel":"应挂在哪个已有节点下，没有合适的填 null"}]}
规则：
- 已有树中出现过的知识点不要重复提取
- label 用领域通用术语；parentLabel 必须精确等于已有节点的 label（或本批次里另一个节点的 label），否则填 null
- 若这一轮是寒暄或没有新知识，返回 {"nodes":[]}`;

export function buildExtractionMessages(
  existingNodes: readonly KnowledgeNodeRow[],
  userQuestion: string,
  assistantAnswer: string,
): ChatMessage[] {
  const treeText =
    existingNodes.length === 0
      ? "（空树）"
      : existingNodes
          .map((node) => `- ${node.label}（父：${findParentLabel(existingNodes, node) ?? "根"}）`)
          .join("\n");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `已有知识树：\n${treeText}\n\n本轮问答：\n【问】${userQuestion}\n【答】${assistantAnswer}`,
    },
  ];
}

function findParentLabel(
  nodes: readonly KnowledgeNodeRow[],
  node: KnowledgeNodeRow,
): string | null {
  if (node.parent_id === null) return null;
  return nodes.find((candidate) => candidate.id === node.parent_id)?.label ?? null;
}
