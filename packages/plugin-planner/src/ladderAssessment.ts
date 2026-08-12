/**
 * Purpose: the ladder's three-stage title contract (spec 032, final form). Stage 1 assesses
 * the learner into an ABSTRACT rung 1..10 (no content leaves this stage); stage 2 has a
 * strong model compose a whole ten-rung comedy ladder for the GOAL once (cached by the
 * caller, never rerolled); stage 3 mechanically appends the goal's identity noun. Pure
 * prompts, schemas, validation and window math — no IO here.
 * Main exports: rungAssessmentSchema, buildRungAssessmentMessages, titleLadderSchema,
 * buildTitleLadderMessages, validateTitleLadder, displayWindow, composeLadderTitles,
 * goalDomainClosure, LadderKnowledgeItem, LadderAssessmentInput.
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

export interface LadderKnowledgeItem {
  label: string;
  /** Plain freshness word, e.g. "熟" / "刚学会" / "有点生疏". */
  freshness: string;
}

export interface LadderAssessmentInput {
  goalTitle: string;
  /** What the learner has actually touched in this knowledge range, with freshness — the ONLY
   * basis for the rung. Never percentages, never "progress". */
  learnedItems: readonly LadderKnowledgeItem[];
  /** A few items in the range the learner has not touched yet. */
  notYetLabels: readonly string[];
}

// ---------------------------------------------------------------------------
// Stage 1 — rung assessment: concrete knowledge in, ONE abstract number out.
// ---------------------------------------------------------------------------

export const rungAssessmentSchema = z.object({
  /** 1 = 还没上路, 10 = 目标在握. The only thing this stage may say about the learner. */
  rung: z.number().int().min(1).max(10),
});

export type RungAssessmentResult = z.infer<typeof rungAssessmentSchema>;

const RUNG_SYSTEM_PROMPT = `你是一个学习进度评估器。给定一个学习目标、学习者在该范围内接触过的内容清单和尚未接触的样例，判断这位学习者在通往目标的路上大约走到了十分之几。
- 1 表示还没上路，10 表示目标在握；只依据清单事实，不猜测
- 平实判断，不奖励也不惩罚
以 JSON 返回：{"rung": 1到10的整数}`;

export function buildRungAssessmentMessages(input: LadderAssessmentInput): ChatMessage[] {
  const learnedLines =
    input.learnedItems.length > 0
      ? input.learnedItems.map((item) => `- ${item.label}（${item.freshness}）`).join("\n")
      : "（还没有接触过这个范围内的内容）";
  const notYetLines =
    input.notYetLabels.length > 0
      ? input.notYetLabels.map((label) => `- ${label}`).join("\n")
      : "（暂无样例）";
  return [
    { role: "system", content: RUNG_SYSTEM_PROMPT },
    {
      role: "user",
      content: `学习目标：${input.goalTitle}\n\n接触过的：\n${learnedLines}\n\n还没接触的（样例）：\n${notYetLines}`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Stage 2 — whole-ladder composition: goal in, ten flavor rungs + identity out.
// ---------------------------------------------------------------------------

export const titleLadderSchema = z.object({
  /** The goal's plain identity noun (做饭→厨师), appended verbatim after every rung. */
  identity: z.string().min(2).max(8),
  /** Ten prefix-shaped flavor phrases, most novice (index 0) to most masterful (index 9). */
  rungs: z.array(z.string().min(2).max(12)).length(10),
});

export type TitleLadderResult = z.infer<typeof titleLadderSchema>;

const LADDER_SYSTEM_PROMPT = `你是一位为排行榜设计段位头衔的命名师。给定一个学习目标，创作一条从最生疏（第1档）到最精通（第10档）的十档趣味段位梯，并给出该目标对应的身份名词。

规则：
- 用这个目标所用语言的互联网社区里最地道的"搞笑段位梯"传统来写——整条梯子读起来像一部连贯的作品，不是十个孤立的词
- 每一档是 2~12 字的修饰性短语，末尾能自然接身份名词（例：某档「双层至尊」接「厨师」成「双层至尊厨师」）
- 手法要多样：最高级堆叠、荒诞量词、叙事感、学术梗、成语改造、双关……相邻档不用同一种手法
- 第10档神话化；第4~7档留给最机灵的梗——过渡态、暧昧态最值得写；第1~2档夸张滑稽但温柔，是"还没出发"的可爱，绝不许有"无可救药"式的嘲讽
- 头衔中禁止出现：具体学科或领域词、数字、百分比、真实游戏的段位词、运气梗词汇
- 身份名词取目标最平实的对应身份（做饭→厨师），2~6 字

风格参考（一条抽卡圈的运气段位梯，只学它的结构与幽默节奏，禁止套用其词汇与题材）：
绝世欧皇／双层至尊欧皇／传说级欧皇／歪打正着的欧皇／薛定谔的欧洲人／脱欧入非／面目全非／非入骨髓／绝世非酋／万劫不复大非酋

以 JSON 返回：{"identity":"身份名词","rungs":["第1档","第2档","...","第10档"]}（rungs 从最生疏到最精通）`;

export function buildTitleLadderMessages(goalTitle: string): ChatMessage[] {
  return [
    { role: "system", content: LADDER_SYSTEM_PROMPT },
    { role: "user", content: `学习目标：${goalTitle}` },
  ];
}

/** Anti-reveal, no metrics, no real-game tiers, no luck-meme vocabulary (the style exemplar
 * must be imitated in craft, never in content), and rungs must not smuggle the identity in. */
const FORBIDDEN_PATTERN =
  /生成|AI|模拟|[0-9０-９%％]|青铜|白银|黄金|铂金|钻石|星耀|王者|欧皇|非酋|欧洲|非洲|脱欧/;

/**
 * Pure post-parse validation for the composed ladder: ten distinct rungs, none tripping the
 * forbidden pattern, identity clean and never embedded in a rung. Null = discard whole
 * ladder (the caller records the failure and keeps whatever board it had).
 */
export function validateTitleLadder(result: TitleLadderResult): TitleLadderResult | null {
  if (FORBIDDEN_PATTERN.test(result.identity)) return null;
  if (new Set(result.rungs).size !== result.rungs.length) return null;
  for (const rung of result.rungs) {
    if (FORBIDDEN_PATTERN.test(rung)) return null;
    if (rung.includes(result.identity)) return null;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Stage 3 — pure math + concatenation. No model anywhere.
// ---------------------------------------------------------------------------

/** The board shows three adjacent rungs; the window keeps three DISTINCT rungs by clamping
 * the centre into 2..9, so the very top and bottom still show real neighbours. */
export function displayWindow(rung: number): { above: number; self: number; below: number } {
  const centre = Math.min(9, Math.max(2, Math.trunc(rung)));
  return { above: centre + 1, self: centre, below: centre - 1 };
}

export interface LadderBoardTitles {
  aboveTitle: string;
  selfTitle: string;
  belowTitle: string;
}

/** rungs are novice-first (index 0); a board line is simply rung text + identity noun —
 * the goal is appended verbatim, never blended (spec 032 §3). */
export function composeLadderTitles(ladder: TitleLadderResult, rung: number): LadderBoardTitles {
  const window = displayWindow(rung);
  const lineOf = (index: number): string => `${ladder.rungs[index - 1] ?? ""}${ladder.identity}`;
  return {
    aboveTitle: lineOf(window.above),
    selfTitle: lineOf(window.self),
    belowTitle: lineOf(window.below),
  };
}
