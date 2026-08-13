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
  settingsTitle: "语言织入(学外语)",
  settingsHint:
    "对话里少量词语显示为目标语言;原文不变,随时可关。基础织入全本地零 token;「智能替换」进阶层在开关与计价页单独开关、单独看账。",
  densityLabel: "替换密度",
  newWordCapLabel: "每日新词上限",
  guessLevelLabel: "猜测频率",
  guessLevelLow: "少",
  guessLevelStandard: "标准",
  guessLevelHigh: "多",
  ttsLabel: "发音(本地 TTS)",
  calibrationTitle: "词汇量校准(可选)",
  calibrationHint: "勾选你认识的词,不确定就不勾。这不打分,只是让新词从合适的位置开始。",
  calibrationDone: "完成校准",
  calibrationRedo: "重新校准",
  calibrationSkip: "先不做",
  piperSection: "Piper 高质量发音(可选)",
  piperPathLabel: "piper 可执行文件路径",
  piperModelLabel: "voice 模型路径(.onnx)",
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
