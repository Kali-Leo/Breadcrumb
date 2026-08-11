/**
 * Purpose: the ladder's real-time assessment LLM contract (spec 022). The ladder IS an
 * assessment system wearing a leaderboard's clothes: given the learner's CONCRETE knowledge
 * state over a goal's domain (learned items with freshness + not-yet samples — the only
 * matching basis, as always), the model writes three 称号: the learner's own (a plain AI
 * summary of what they currently grasp), one for a state slightly ahead, one slightly behind.
 * No ranks, no numbers, no mechanism anywhere. Plus pure post-parse validation: anti-"AI
 * reveal" tripwire, no digits/percent, three distinct lines.
 * Main exports: ladderAssessmentSchema, buildLadderAssessmentMessages, LadderAssessmentInput,
 * LadderKnowledgeItem, LadderAssessmentResult, validateLadderAssessment, goalDomainClosure.
 */
import type { KnowledgeEdgeRow } from "@breadcrumb/core-db";
import type { ChatMessage } from "@breadcrumb/core-llm";
import { prerequisiteClosure } from "@breadcrumb/plugin-graph";
import { z } from "zod";

/**
 * A goal's "domain" for snapshot purposes is its requires-closure recomputed fresh every
 * call, unioned with the goal's own node set — as new nodes land in the same prerequisite
 * tree, prerequisiteClosure() picks them up on its next call for free.
 */
export function goalDomainClosure(
  edges: readonly KnowledgeEdgeRow[],
  goalNodeIds: readonly string[],
): string[] {
  const closure = prerequisiteClosure(edges, goalNodeIds);
  return [...new Set([...closure, ...goalNodeIds])];
}

const titleSchema = z.string().min(2).max(30);

export const ladderAssessmentSchema = z.object({
  /** The state one step ahead of the learner's — the neighbor above. */
  aboveTitle: titleSchema,
  /** The learner's own 称号: a plain summary of what they currently grasp. */
  selfTitle: titleSchema,
  /** The state one step behind — the neighbor below. */
  belowTitle: titleSchema,
});

export type LadderAssessmentResult = z.infer<typeof ladderAssessmentSchema>;

export interface LadderKnowledgeItem {
  label: string;
  /** Plain freshness word, e.g. "熟" / "刚学会" / "有点生疏". */
  freshness: string;
}

export interface LadderAssessmentInput {
  goalTitle: string;
  /** What the learner has actually touched in this knowledge range, with freshness — the ONLY
   * basis for the assessment. Never percentages, never "progress". */
  learnedItems: readonly LadderKnowledgeItem[];
  /** A few items in the range the learner has not touched yet. */
  notYetLabels: readonly string[];
}

const SYSTEM_PROMPT = `你是一个排行榜片段生成器。所有人都会在任何知识范围内被自动排位并得到一个头衔——像游戏里的称号那样：名词性、有画面感、让人一眼记住，同时如实反映此刻在这个知识范围内实际掌握了什么。给定一位学习者的具体接触情况，写出榜上相邻三行的头衔，以 JSON 返回：
{"aboveTitle":"紧挨在上方那一档状态的头衔","selfTitle":"这位学习者本人的头衔","belowTitle":"紧挨在下方那一档状态的头衔"}
请遵循：
- 头衔是名词短语而非状态句（好例：「闭包点灯人」「原型链门外的访客」「递归迷宫初行者」；坏例：「刚点亮闭包，原型链还没碰」——这是句子，不是头衔）
- 每个头衔 2~14 字，必须贴着下面列出的具体知识点造词——只依据给出的清单，不猜测
- 禁止青铜/白银/黄金/大师/王者/新手/大神这类通用等级词；禁止任何数字、百分比、名次
- aboveTitle 对应比这位学习者略多会一点点的状态（往未学清单里最近的一步靠）；belowTitle 对应略少会一点点的状态——"略"是字面义，相邻档位差距很小
- 有趣但不评价：不夸赞、不贬低、不催促——趣味来自具体的画面，不来自褒贬
- 三个头衔必须互不相同`;

export function buildLadderAssessmentMessages(input: LadderAssessmentInput): ChatMessage[] {
  const learnedLines =
    input.learnedItems.length > 0
      ? input.learnedItems.map((item) => `- ${item.label}（${item.freshness}）`).join("\n")
      : "（还没有接触过这个范围内的内容）";
  const notYetLines =
    input.notYetLabels.length > 0
      ? input.notYetLabels.map((label) => `- ${label}`).join("\n")
      : "（暂无样例）";
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `知识范围：${input.goalTitle}\n\n这位学习者接触过的：\n${learnedLines}\n\n这个范围内还没接触的（样例）：\n${notYetLines}`,
    },
  ];
}

/** Anti-"AI reveal" tripwire (never fed to the prompt) plus the no-numbers rule — a title
 * carrying any of these would break the leaderboard disguise or smuggle a metric back in. */
const FORBIDDEN_PATTERN = /生成|AI|模拟|[0-9０-９%％]/;

/**
 * Pure post-parse validation: all three titles present (schema already enforced), none
 * tripping the forbidden pattern, all three distinct. Returns null when the whole assessment
 * must be discarded — the caller keeps whatever board it had.
 */
export function validateLadderAssessment(
  result: LadderAssessmentResult,
): LadderAssessmentResult | null {
  const titles = [result.aboveTitle, result.selfTitle, result.belowTitle];
  if (titles.some((title) => FORBIDDEN_PATTERN.test(title))) return null;
  if (new Set(titles).size !== titles.length) return null;
  return result;
}
