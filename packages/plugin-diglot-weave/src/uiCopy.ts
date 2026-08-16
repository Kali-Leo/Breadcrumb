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
  settingsHint:
    "对话里会有少量词语显示成你正在学的语言;原文都还在,点一下就能看,也随时可以关闭。更准确的「智能替换」可以在设置的开关与计价页打开。",
  densityLabel: "替换频率",
  newWordCapLabel: "每日新词上限",
  guessLevelLabel: "猜测频率",
  guessLevelLow: "少",
  guessLevelStandard: "标准",
  guessLevelHigh: "多",
  ttsLabel: "朗读",
  contrastLabel: "易混对比",
  placementStatus: "新词难度起点",
  placementNote: "会随你的阅读自动调整,不用管它",
  piperSection: "更好听的发音(可选,需要自己装 Piper)",
  piperPathLabel: "Piper 程序的位置",
  piperModelLabel: "语音文件的位置(.onnx)",
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
