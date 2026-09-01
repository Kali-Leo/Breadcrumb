/**
 * Purpose: public surface of the language layer — which languages exist, which one to start
 * in, what to tell the model, and whether it listened. No UI and no message catalogues here;
 * those live in apps/desktop.
 */
export {
  type AnswerLanguageChoice,
  buildLanguageDirective,
  resolveAnswerLanguage,
} from "./answerLanguage";
export {
  fontStackFor,
  formatCount,
  formatDate,
  formatDayMonth,
  formatPercent,
  formatSignedDecimal,
} from "./format";
export {
  DEFAULT_LANGUAGE_CODE,
  FALLBACK_ANSWER_LANGUAGE_CODE,
  isLanguageCode,
  LANGUAGES,
  type Language,
  languageNameOf,
  languageOf,
  type ModelLanguageSupport,
  type ScriptFamily,
  type TextDirection,
  UI_LANGUAGE_CODES,
} from "./languages";
export type { CopyMessage } from "./message";
export { matchLanguage, negotiateLanguage } from "./negotiate";
export { checkReplyLanguage, type ReplyLanguageVerdict } from "./replyLanguage";
