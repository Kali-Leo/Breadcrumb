/**
 * Purpose: the goal-mapping LLM contract — prompt construction and Zod schema for turning a
 * free-text learning goal (e.g. "通过考研数学") into a subset of existing tree node labels
 * plus new concept-node suggestions the tree doesn't have yet. Both are persisted immediately
 * in full — there is no checkbox calibration step (2026-08-02: domain judgment is the
 * system's job, not something to ask of a learner who hasn't studied the material yet).
 * Main exports: goalMappingSchema, buildGoalMappingMessages, GoalMappingResult, SuggestedGoalNode.
 */
import type { ChatMessage } from "@breadcrumb/core-llm";
import { z } from "zod";

export const goalMappingSchema = z.object({
  /** Must exactly match a subset of the given existing node labels. */
  existing: z.array(z.string().min(1)).max(30),
  suggested: z
    .array(
      z.object({
        label: z.string().min(1).max(40),
        summary: z.string().min(1).max(200),
        /** Hard prerequisites of this node, by label, drawn from this same mapping's
         * existing + suggested set (spec 016 / 2026-08-28 audit). Unknown labels are dropped
         * by the caller — Zod can't cross-check them against a set it doesn't have. Optional
         * because an older/terser model response is still usable: a goal with no edges
         * degrades to the previous alphabetical route, it doesn't fail. */
        requires: z.array(z.string().min(1)).max(10).optional(),
      }),
    )
    .max(15),
});

export type GoalMappingResult = z.infer<typeof goalMappingSchema>;
export type SuggestedGoalNode = GoalMappingResult["suggested"][number];

const SYSTEM_PROMPT = `你是一个学习目标拆解器。学习者会用自然语言描述一个学习目标（如"通过考研数学"），
你需要判断达成这个目标大致需要哪些知识点，以 JSON 返回：
{"existing":["已有知识点列表中原样匹配的节点名"],"suggested":[{"label":"目标需要但树里还没有的知识点短名","summary":"这个知识点是什么(一句话)","requires":["必须先学会的知识点名"]}]}
规则：
- existing 的每一项必须完全等于「已有知识点列表」中的一个原名，绝不允许发明不存在的节点名
- suggested 是目标需要、但已有知识点列表里确实没有的概念，最多 15 个，宁缺毋滥——不确定、可有可无的不要列
- existing 与 suggested 合起来应当大致覆盖达成这个目标所需的知识范围，但不必穷尽细节
- requires 是硬前置：不先学会它就根本没法开始学这个知识点（例如「多元函数微分」的 requires 是「导数」）。
  只是"学了有帮助""顺序上通常在前面"不算硬前置，不要写
- requires 里的每一项必须是本次 existing 或 suggested 里出现过的名字，不许引用集合外的东西；
  宁缺毋滥，拿不准就留空或不写这个字段。不要形成循环依赖
- 若已有知识点已完全覆盖目标，suggested 返回空数组；若完全是全新领域，existing 可以为空数组`;

export function buildGoalMappingMessages(
  goalText: string,
  existingNodeLabels: readonly string[],
): ChatMessage[] {
  const listText =
    existingNodeLabels.length === 0
      ? "（空树）"
      : existingNodeLabels.map((label) => `- ${label}`).join("\n");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `已有知识点列表：\n${listText}\n\n学习目标：\n${goalText}` },
  ];
}
