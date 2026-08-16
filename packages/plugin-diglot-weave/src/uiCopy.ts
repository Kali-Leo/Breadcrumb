/**
 * Purpose: every user-visible string of the diglot weave in one place (spec 033) — plain
 * statements only (product principle 1: no praise, no performed warmth); simlab scans this
 * module against the pressure lexicon.
 * Main exports: DIGLOT_UI_COPY, feedbackTextFor.
 */
import type { DiglotGuessGrade } from "@breadcrumb/core-db";

/** Static UI strings (cards, settings). Keys exist so the simlab scan can name a hit. */
export const DIGLOT_UI_COPY = {
  guessPrompt: "这个词是什么意思?先猜一次,再看释义。",
  guessPlaceholder: "你的猜测",
  guessSubmit: "提交",
  alsoTranslatedAs: "也作",
  settingsTitle: "语言学习",
  settingsHint: "对话里会有部分词替换为你正在学的另一种语言",
  pairStatus: "从中文学 English",
  llmRefineLabel: "智能替换",
  llmRefineHint: "让 AI 按上下文挑更合适的词替换，效果更准，但每条消息花一小笔。",
  learningWordsTitle: "正在学的词",
  learningWordsEmpty: "开始对话后，学到的词会出现在这里。",
  contrastLabel: "易混对比",
} as const;

/** Guess feedback: plain statements of fact, one per grade. */
export function feedbackTextFor(grade: DiglotGuessGrade, originalSurface: string): string {
  switch (grade) {
    case "correct":
      return `是「${originalSurface}」。`;
    case "close":
      return `接近——它是「${originalSurface}」。`;
    case "wrong":
      return `它是「${originalSurface}」。`;
  }
}
