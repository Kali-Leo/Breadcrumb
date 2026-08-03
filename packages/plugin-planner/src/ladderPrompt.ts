/**
 * Purpose: the pseudo-ranked-ladder generation LLM contract (spec 016 #3) — prompt
 * construction and Zod schema for turning one goal's domain sample + the user's current
 * milestone into 5 reference figures (2 slightly above / 1 near / 2 slightly below), plus
 * pure post-parse validation (forbidden-description drop, distinct-milestone dedup,
 * milestone-sorted positions, whole-generation failure below 3 valid figures).
 * Main exports: ladderGenerationSchema, buildLadderGenerationMessages,
 * LadderGenerationInput, ValidatedLadderFigure, validateLadderGeneration,
 * MIN_VALID_LADDER_FIGURES.
 */
import type { ChatMessage } from "@breadcrumb/core-llm";
import { z } from "zod";

export const ladderFigureSchema = z.object({
  /** e.g. "24 岁的拿破仑" — a person (historical, archetypal or fictional), plus their
   * age/period. Describes the figure only, never the learner. */
  figureDesc: z.string().min(1).max(30),
  /** Why they sit at this level — domain-specific, concrete, interesting; still only about
   * the figure, never an evaluation of the learner. */
  figureNote: z.string().min(1).max(60),
  milestone: z.number().int().min(0).max(100),
});

export const ladderGenerationSchema = z.object({
  figures: z.array(ladderFigureSchema).length(5),
});

export type LadderGenerationResult = z.infer<typeof ladderGenerationSchema>;
export type LadderFigureProposal = z.infer<typeof ladderFigureSchema>;

export interface LadderGenerationInput {
  goalTitle: string;
  /** Up to 10 lit-node labels from this goal's domain — grounds the model in what this goal
   * is actually about, without dumping the whole tree into the prompt. */
  domainLabelsSample: readonly string[];
  /** The learner's current milestone (0..100) for this goal. */
  userMilestone: number;
  /** Every figure_desc ever shown for this goal (ladder_shown_descriptions) — must never
   * reappear, even across regenerations. */
  forbiddenDescriptions: readonly string[];
}

const SYSTEM_PROMPT = `你是一个学习进度参照榜生成器。给定一个学习目标、该目标领域的一些已学知识点样例、
学习者当前的里程数(0~100)，生成 5 位有代表性、有意思的人物作为"水平邻居"参照，以 JSON 返回：
{"figures":[{"figureDesc":"人物+年龄或所处时期(如 24 岁的拿破仑)","figureNote":"一句话说明这个人物为什么在这个里程，需具体、和目标领域相关、有趣——只描述这个人物本身，绝不评价学习者","milestone":0~100的整数}]}
规则：
- 5 位人物中，2 位的里程略高于学习者当前里程、1 位相近、2 位略低于学习者当前里程，高低偏移大致在 3~15 之间
- 人物可以来自任何时代、任何身份、真实或虚构皆可，越有意思、越贴合目标领域越好；不要每次都选同一类名人
- 5 个里程数必须互不相同
- figureDesc 绝不能与"历史已用描述清单"中任何一条完全重复（同一人物不同年龄视为不同描述，允许再次使用同一人物的不同年龄）
- 语气中立平和，figureNote 只描述人物本身，绝不出现对学习者的评价或建议`;

export function buildLadderGenerationMessages(input: LadderGenerationInput): ChatMessage[] {
  const domainText =
    input.domainLabelsSample.length === 0
      ? "（暂无样例）"
      : input.domainLabelsSample.map((label) => `- ${label}`).join("\n");
  const forbiddenText =
    input.forbiddenDescriptions.length === 0
      ? "（无）"
      : input.forbiddenDescriptions.map((desc) => `- ${desc}`).join("\n");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `学习目标：${input.goalTitle}\n目标领域知识点样例：\n${domainText}\n学习者当前里程：${input.userMilestone}\n历史已用描述清单：\n${forbiddenText}`,
    },
  ];
}

export interface ValidatedLadderFigure {
  figureDesc: string;
  figureNote: string;
  milestone: number;
  /** Stable display order, assigned by sorting the validated figures by milestone desc. */
  position: number;
}

/** Below this many surviving figures, the whole generation is treated as failed (the caller
 * should fall back to the previous ladder, or show nothing, rather than persist a thin one). */
export const MIN_VALID_LADDER_FIGURES = 3;

/** Drops any figure whose figureDesc violates the forbidden list, then dedupes by milestone
 * (first occurrence wins — a later duplicate is presumed a model mistake, not a deliberate
 * near-tie). Returns null when fewer than MIN_VALID_LADDER_FIGURES survive. Otherwise assigns
 * `position` by sorting the survivors milestone-descending, for a stable display order. */
export function validateLadderGeneration(
  result: LadderGenerationResult,
  forbiddenDescriptions: readonly string[],
): ValidatedLadderFigure[] | null {
  const forbidden = new Set(forbiddenDescriptions);
  const seenMilestones = new Set<number>();
  const kept: LadderFigureProposal[] = [];

  for (const figure of result.figures) {
    if (forbidden.has(figure.figureDesc)) continue;
    if (seenMilestones.has(figure.milestone)) continue;
    seenMilestones.add(figure.milestone);
    kept.push(figure);
  }

  if (kept.length < MIN_VALID_LADDER_FIGURES) return null;

  return [...kept]
    .sort((a, b) => b.milestone - a.milestone)
    .map((figure, index) => ({ ...figure, position: index }));
}
