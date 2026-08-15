/**
 * Purpose: the companion student's per-session knowledge state (spec 037) — script-first
 * teach-back ported from rschmucker/ruffle-and-riley (AIED 2024, MIT) seeds the state with
 * expectations/misconceptions/gaps, and the Reflect-Respond loop from TeachYou/AlgoBo
 * (CHI 2024) merges each round's explanation into it before the student's next reply is
 * capability-constrained to only what the state says it has been taught.
 * Main exports: KnowledgeStateSchema, KnowledgeState, SCRIPT_PROMPT, ScriptResultSchema,
 * buildScriptUserMessage, initialKnowledgeState, REFLECT_PROMPT, ReflectResultSchema,
 * buildReflectUserMessage, applyReflection, buildStudentSystemPrompt.
 */
import { z } from "zod";

export const KnowledgeStateSchema = z.object({
  topic: z.string().min(1),
  knownConcepts: z.array(z.string().min(1)),
  misconceptions: z.array(
    z.object({
      belief: z.string().min(1),
      corrected: z.boolean(),
    }),
  ),
  gaps: z.array(z.string().min(1)),
});
export type KnowledgeState = z.infer<typeof KnowledgeStateSchema>;

export const SCRIPT_PROMPT =
  "你在为一次「回讲」准备脚本。给定一个主题,请给出:一段正确讲解应该覆盖的关键点" +
  "(expectations,2-4 条);直接针对这个主题本身的、初学者常见的误解,最多 2 条" +
  "(misconceptions,没有就给空数组);以及初学者通常还不懂的空白点(gaps,1-4 条)。" +
  "语气平实,不评价。" +
  '只返回 JSON:{"expectations":["…"],"misconceptions":["…"],"gaps":["…"]}';

export const ScriptResultSchema = z.object({
  expectations: z.array(z.string().min(1)).min(2).max(4),
  misconceptions: z.array(z.string().min(1)).min(0).max(2),
  gaps: z.array(z.string().min(1)).min(1).max(4),
});
export type ScriptResult = z.infer<typeof ScriptResultSchema>;

export function buildScriptUserMessage(topic: string, knownNodeLabels: readonly string[]): string {
  const knownText =
    knownNodeLabels.length > 0 ? knownNodeLabels.join("、") : "(没有已知背景知识点)";
  return `主题:${topic}\n学习者已知的相关知识点:${knownText}`;
}

/** Seeds a fresh per-session knowledge state from a generated script: no concepts taught
 * yet, the script's misconceptions all start uncorrected, gaps carried over as-is. */
export function initialKnowledgeState(topic: string, script: ScriptResult): KnowledgeState {
  return {
    topic,
    knownConcepts: [],
    misconceptions: script.misconceptions.map((belief) => ({ belief, corrected: false })),
    gaps: script.gaps,
  };
}

export const REFLECT_PROMPT =
  "你在阅读学习者刚刚给出的讲解,对照学生当前的知识状态判断:这段讲解教会了学生哪些概念" +
  "(learnedConcepts),以及纠正了学生列表中的哪些误解(correctedMisconceptions —— 必须是" +
  "学生误解列表里逐字出现的条目)。没有就给空数组。" +
  '只返回 JSON:{"learnedConcepts":["…"],"correctedMisconceptions":["…"]}';

export const ReflectResultSchema = z.object({
  learnedConcepts: z.array(z.string().min(1)),
  correctedMisconceptions: z.array(z.string().min(1)),
});
export type ReflectResult = z.infer<typeof ReflectResultSchema>;

export function buildReflectUserMessage(state: KnowledgeState, userExplanation: string): string {
  const knownText = state.knownConcepts.length > 0 ? state.knownConcepts.join("、") : "(无)";
  const uncorrectedText =
    state.misconceptions
      .filter((misconception) => !misconception.corrected)
      .map((misconception) => misconception.belief)
      .join("、") || "(无)";
  return (
    `主题:${state.topic}\n学生已学会:${knownText}\n学生尚未纠正的误解:${uncorrectedText}\n\n` +
    `学习者刚才的讲解:\n${userExplanation}`
  );
}

/** Merges a reflect result into the state: learned concepts are added (deduped), and any
 * listed misconception whose belief string exactly matches flips to corrected. */
export function applyReflection(state: KnowledgeState, result: ReflectResult): KnowledgeState {
  const knownConcepts = [...new Set([...state.knownConcepts, ...result.learnedConcepts])];
  const correctedBeliefs = new Set(result.correctedMisconceptions);
  const misconceptions = state.misconceptions.map((misconception) =>
    correctedBeliefs.has(misconception.belief)
      ? { ...misconception, corrected: true }
      : misconception,
  );
  return { ...state, knownConcepts, misconceptions };
}

/** Teach-session system prompt for the student companion: identity (name, explicit AI
 * disclosure), the spec-034 student stance (one question at a time, plain tone, no praise or
 * judgment), and the hard capability constraint that keeps replies inside the current
 * knowledge state. One positive-instruction block (tone contract 2026-08-02) — mirrors the
 * register of apps/desktop/src/lib/teachActions.ts's buildTeachSystemPrompt. */
export function buildStudentSystemPrompt(
  card: { data: { name: string; personality: string } },
  state: KnowledgeState,
): string {
  const knownText =
    state.knownConcepts.length > 0 ? state.knownConcepts.join("、") : "目前还没有被教过任何内容";
  const uncorrected = state.misconceptions
    .filter((misconception) => !misconception.corrected)
    .map((misconception) => misconception.belief);
  const misconceptionsLine =
    uncorrected.length > 0
      ? `你目前的误解(自然地表现出来,一旦被纠正就在回应里体现出改变;对方没纠出来就存疑放过,绝不揭底):${uncorrected.join("、")}。`
      : "";
  const gapsLine = state.gaps.length > 0 ? `你知道自己还不懂:${state.gaps.join("、")}。` : "";

  return (
    `你是 ${card.data.name},${card.data.personality}你是明示的 AI 学习伙伴,` +
    `被问起是不是 AI 时如实承认。你正在向学习者请教「${state.topic}」,一次只问一个具体的问题,` +
    "多问为什么和如果会怎样;哪里没听懂或觉得有跳步就直说;语气平实,不评判、不夸赞、" +
    "不替对方下结论。当你觉得听懂了,用自己的话把理解复述一遍,并说明还有哪里不确定。" +
    `只能使用「已被教过的内容」清单里的知识作答,已被教过的内容:${knownText}。` +
    `${misconceptionsLine}${gapsLine}`
  ).trim();
}
