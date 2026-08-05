/**
 * Purpose: the ranked-ladder persona generation LLM contract (spec 020) — prompt construction
 * and Zod schema for turning the learner's CONCRETE knowledge state (learned items with
 * freshness + not-yet samples) into 5 deceased famous people whose grasp of exactly those
 * items credibly sits just above (3) or just below (2) the learner's. Plus pure post-parse
 * validation: anti-"AI reveal" tripwire, within-batch identity dedup, whole-generation failure
 * below 3 valid figures. Ranks are never generated here — rankEngine anchors them.
 * Main exports: ladderFigureSchema, ladderGenerationSchema, buildLadderGenerationMessages,
 * LadderGenerationInput, LadderKnowledgeItem, ValidatedLadderFigure, validateLadderGeneration,
 * MIN_VALID_LADDER_FIGURES.
 */
import type { ChatMessage } from "@breadcrumb/core-llm";
import { z } from "zod";

export const ladderChatProfileSchema = z.object({
  /** A short character sketch — the spec 019 friend-chat foundation, persisted but unused
   * this spec. */
  personality: z.string().min(1).max(60),
  /** e.g. "晚间活跃" — when this persona tends to be around. */
  activeHours: z.string().min(1).max(20),
  /** e.g. "慢热短句" — how this persona tends to reply. */
  replyStyle: z.string().min(1).max(20),
});

export const ladderFigureSchema = z.object({
  /** The real, commonly-known name of a deceased famous person — any country, any era.
   * 40 chars leaves room for transliterated full names, though the prompt asks for the
   * shortest widely-known form. */
  name: z.string().min(1).max(40),
  /** Any age within the person's real lifespan — famous people need not appear at their peak. */
  age: z.number().int().min(3).max(120),
  /** e.g. "文艺复兴期间" / "20世纪60年代". */
  era: z.string().min(1).max(20),
  /** May be the literal string "保密". */
  occupation: z.string().min(1).max(16),
  /** The one line this persona chooses to show on hover — never about the learner. */
  selfLine: z.string().min(1).max(80),
  chatProfile: ladderChatProfileSchema,
});

export const ladderGenerationSchema = z.object({
  figures: z.array(ladderFigureSchema).length(5),
});

export type LadderGenerationResult = z.infer<typeof ladderGenerationSchema>;
export type LadderFigureProposal = z.infer<typeof ladderFigureSchema>;
export type LadderChatProfile = z.infer<typeof ladderChatProfileSchema>;

export interface LadderKnowledgeItem {
  label: string;
  /** Plain freshness word, e.g. "熟" / "刚学会" / "有点生疏". */
  freshness: string;
}

export interface LadderGenerationInput {
  goalTitle: string;
  /** What the learner has actually touched in this knowledge range, with freshness — the ONLY
   * basis for matching people to positions. Never percentages, never "progress". */
  learnedItems: readonly LadderKnowledgeItem[];
  /** A few items in the range the learner has not touched yet. */
  notYetLabels: readonly string[];
}

const SYSTEM_PROMPT = `你是一个排行榜片段生成器。所有人都会在任何知识范围内被自动排位，与他们自己的人生无关。给定一位学习者对某个知识范围的具体接触情况，生成紧挨着这位学习者的 5 位邻居，以 JSON 返回：
{"figures":[{
  "name":"人名，用世人最熟知的最简称呼，不超过40字",
  "age":3~120之间的整数,
  "era":"所处年代，不超过20字，如 文艺复兴期间 / 20世纪60年代",
  "occupation":"职业，不超过16字，也可以直接写 保密",
  "selfLine":"这个人自己愿意公开说的一句话，不超过80字",
  "chatProfile":{"personality":"性格速写，不超过60字","activeHours":"活跃时段，不超过20字，如 晚间活跃","replyStyle":"说话风格，不超过20字，如 慢热短句"}
}]}
请遵循：
- 5 位全部必须是已经去世的真实名人，任何国家、任何时代、任何领域都可以；选有趣的人，不必与这个知识范围同领域，也不必处于其成就的巅峰年龄
- 姓名用其真实姓名（本名或世人最熟知的称呼），贴合其年代与地域
- 关键匹配：第1~3位在其选定年龄时对下面列出的具体知识点的掌握，应比这位学习者略多一点；第4~5位应略少一点。判断标准只有一个——"这个人在这个年龄，对这几个具体知识点会懂多少"，务必合理（与此知识范围无关的名人恰好不懂这些=完全合理）
- selfLine 的写法：如果一定要这个人写一个主页签名，以他的性格，他会写什么
- 请全程只描述这些人物本身，不要提及这位学习者`;

export function buildLadderGenerationMessages(input: LadderGenerationInput): ChatMessage[] {
  const learnedText =
    input.learnedItems.length === 0
      ? "（还没接触过任何知识点）"
      : input.learnedItems.map((item) => `- ${item.label}（${item.freshness}）`).join("\n");
  const notYetText =
    input.notYetLabels.length === 0
      ? "（暂无）"
      : input.notYetLabels.map((label) => `- ${label}`).join("\n");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `知识范围：${input.goalTitle}\n这位学习者已经接触过的知识点：\n${learnedText}\n还没接触过的知识点样例：\n${notYetText}`,
    },
  ];
}

/** Drops any figure whose selfLine trips the code-level "never reveal you're generated/AI/a
 * simulation" tripwire — deliberately NOT prompt-stuffed (telling a model about an AI-
 * detection check tends to make it write about AI), this is a pure post-hoc regex guard. */
const AI_REVEAL_TRIPWIRE = /生成|AI|模拟/i;

export interface ValidatedLadderFigure {
  name: string;
  age: number;
  era: string;
  occupation: string;
  selfLine: string;
  chatProfile: LadderChatProfile;
  /** Stable display order, assigned by original batch order among the survivors. */
  position: number;
}

/** Below this many surviving figures, the whole generation is treated as failed (the caller
 * should fall back to the previous board, or show nothing, rather than persist a thin one). */
export const MIN_VALID_LADDER_FIGURES = 3;

/** Drops figures that trip the AI-reveal tripwire or repeat a `${name}|${era}` identity kept
 * earlier in this same batch (first occurrence wins — a later duplicate is presumed a model
 * mistake). There is no cross-generation forbidden list: leaderboards simply change, and a
 * familiar face resurfacing at another age later is normal (Leo, 08 §五). Returns null when
 * fewer than MIN_VALID_LADDER_FIGURES survive; otherwise assigns `position` by batch order. */
export function validateLadderGeneration(
  result: LadderGenerationResult,
): ValidatedLadderFigure[] | null {
  const seenIdentities = new Set<string>();
  const kept: LadderFigureProposal[] = [];

  for (const figure of result.figures) {
    if (AI_REVEAL_TRIPWIRE.test(figure.selfLine)) continue;
    const identity = `${figure.name}|${figure.era}`;
    if (seenIdentities.has(identity)) continue;
    seenIdentities.add(identity);
    kept.push(figure);
  }

  if (kept.length < MIN_VALID_LADDER_FIGURES) return null;

  return kept.map((figure, index) => ({
    name: figure.name,
    age: figure.age,
    era: figure.era,
    occupation: figure.occupation,
    selfLine: figure.selfLine,
    chatProfile: figure.chatProfile,
    position: index,
  }));
}
