/**
 * Purpose: the ranked-ladder persona generation LLM contract (spec 018 #3) — prompt
 * construction and Zod schema for turning one goal's domain sample into 5 player-shaped
 * personas (2 named historical/real figures + 3 fictional ordinary people), plus pure
 * post-parse validation (identity uniqueness, code-level anti-"AI reveal" tripwire, famous-
 * count tolerance, whole-generation failure below 3 valid figures). Ranks are never generated
 * here — plugin-planner/rankEngine anchors them separately; this file only invents who the
 * figures are.
 * Main exports: ladderFigureSchema, ladderGenerationSchema, buildLadderGenerationMessages,
 * LadderGenerationInput, ValidatedLadderFigure, validateLadderGeneration,
 * MIN_VALID_LADDER_FIGURES, figureIdentity.
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
  name: z.string().min(1).max(20),
  age: z.number().int().min(5).max(120),
  /** e.g. "文艺复兴期间" / "21 世纪 20 年代". */
  era: z.string().min(1).max(20),
  /** May be the literal string "保密". */
  occupation: z.string().min(1).max(16),
  /** The one line this persona chooses to show on hover — never an evaluation of the
   * learner, only ever about the persona itself. */
  selfLine: z.string().min(1).max(80),
  isFamous: z.enum(["名人", "普通人"]),
  chatProfile: ladderChatProfileSchema,
});

export const ladderGenerationSchema = z.object({
  figures: z.array(ladderFigureSchema).length(5),
});

export type LadderGenerationResult = z.infer<typeof ladderGenerationSchema>;
export type LadderFigureProposal = z.infer<typeof ladderFigureSchema>;
export type LadderChatProfile = z.infer<typeof ladderChatProfileSchema>;

export interface LadderGenerationInput {
  goalTitle: string;
  /** Up to 10 lit-node labels from this goal's domain — grounds the model in what this goal
   * is actually about, without dumping the whole tree into the prompt. */
  domainLabelsSample: readonly string[];
  /** Every `${name}|${era}` identity ever shown for this goal (ladder_shown_identities) —
   * must never reappear, even across regenerations. */
  forbiddenIdentities: readonly string[];
}

const SYSTEM_PROMPT = `你是一个学习参照板生成器。给定一个学习目标和该领域的一些已学知识点样例，生成 5 位人物，以 JSON 返回：
{"figures":[{
  "name":"人名，不超过20字",
  "age":5~120之间的整数,
  "era":"所处年代，不超过20字，如 文艺复兴期间 / 21世纪20年代",
  "occupation":"职业，不超过16字，也可以直接写 保密",
  "selfLine":"这个人自己愿意公开说的一句话，不超过80字",
  "isFamous":"名人 或 普通人",
  "chatProfile":{"personality":"性格速写，不超过60字","activeHours":"活跃时段，不超过20字，如 晚间活跃","replyStyle":"说话风格，不超过20字，如 慢热短句"}
}]}
请遵循：
- 请安排 2 位真实存在过的名人（任何时代任何领域皆可）与 3 位虚构的普通人
- 名人的 selfLine 请写得让懂行的人能猜出这是谁——用成就或处境去暗示，把名字留在悬念里；榜面其余字段请照实呼应这位人物
- 名人在该领域的知识水平画像请让人信服
- 普通人的 selfLine 请写出生活气——找搭子、喊加油、求帮忙这类带目的或带点语无伦次的发言都很好
- 每位人物的 name+era 组合请都与"已用过的组合清单"不同
- 请全程只描述这些人物本身，把镜头留在他们身上`;

export function buildLadderGenerationMessages(input: LadderGenerationInput): ChatMessage[] {
  const domainText =
    input.domainLabelsSample.length === 0
      ? "（暂无样例）"
      : input.domainLabelsSample.map((label) => `- ${label}`).join("\n");
  const forbiddenText =
    input.forbiddenIdentities.length === 0
      ? "（无）"
      : input.forbiddenIdentities.map((identity) => `- ${identity}`).join("\n");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `学习目标：${input.goalTitle}\n目标领域知识点样例：\n${domainText}\n已用过的组合清单（name|era）：\n${forbiddenText}`,
    },
  ];
}

/** `${name}|${era}` — the identity key used for both the forbidden list and within-batch
 * dedup (spec 018 #3 binding decision). */
export function figureIdentity(figure: Pick<LadderFigureProposal, "name" | "era">): string {
  return `${figure.name}|${figure.era}`;
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
  isFamous: boolean;
  chatProfile: LadderChatProfile;
  /** Stable display order, assigned by original batch order among the survivors. */
  position: number;
}

/** Below this many surviving figures, the whole generation is treated as failed (the caller
 * should fall back to the previous ladder, or show nothing, rather than persist a thin one). */
export const MIN_VALID_LADDER_FIGURES = 3;

/** Drops figures that trip the AI-reveal tripwire, collide with the forbidden identity list,
 * or repeat an identity already kept earlier in this same batch (first occurrence wins — a
 * later duplicate is presumed a model mistake, not a deliberate near-tie). Returns null when
 * fewer than MIN_VALID_LADDER_FIGURES survive. Otherwise assigns `position` by original batch
 * order. Does NOT enforce the exactly-2-famous target itself — callers should count
 * `isFamous` among the result and log a deviation (spec 018 #3: accept a 1-3 split, but note
 * it) rather than reject the batch over it. */
export function validateLadderGeneration(
  result: LadderGenerationResult,
  forbiddenIdentities: readonly string[],
): ValidatedLadderFigure[] | null {
  const forbidden = new Set(forbiddenIdentities);
  const seenIdentities = new Set<string>();
  const kept: LadderFigureProposal[] = [];

  for (const figure of result.figures) {
    if (AI_REVEAL_TRIPWIRE.test(figure.selfLine)) continue;
    const identity = figureIdentity(figure);
    if (forbidden.has(identity)) continue;
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
    isFamous: figure.isFamous === "名人",
    chatProfile: figure.chatProfile,
    position: index,
  }));
}
