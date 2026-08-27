/**
 * Purpose: the line appended to every system prompt that tells the model which language to
 * write in, and the decision of which language that is. Prompts stay authored in Chinese —
 * Leo reads and edits them, and models follow cross-lingual instructions fine — so only the
 * directive names the target language.
 * Main exports: resolveAnswerLanguage, buildLanguageDirective.
 */
import {
  DEFAULT_LANGUAGE_CODE,
  FALLBACK_ANSWER_LANGUAGE_CODE,
  type Language,
  languageOf,
} from "./languages";

export interface AnswerLanguageChoice {
  /** Interface language — what the app's own text is in. */
  interfaceLanguage: Language;
  /** What the model is asked to write in; differs only when the user asked it to. */
  answerLanguage: Language;
  /** True when the model is thin in the interface language and the user has not decided yet. */
  worthOffering: boolean;
}

/**
 * The interface language is also the answer language unless the user has explicitly picked
 * another one. We never switch on the user's behalf: a silent switch would mean their child
 * asks a question in their own language and gets an answer they cannot read.
 */
export function resolveAnswerLanguage(
  interfaceLanguageCode: string,
  answerLanguageOverride: string | null,
): AnswerLanguageChoice {
  const interfaceLanguage =
    languageOf(interfaceLanguageCode) ??
    languageOf(DEFAULT_LANGUAGE_CODE) ??
    // The table always contains the default; this keeps the types honest.
    ({
      code: DEFAULT_LANGUAGE_CODE,
      endonym: DEFAULT_LANGUAGE_CODE,
      detectionCodes: [],
      direction: "ltr",
      script: "latin",
      modelSupport: "strong",
      shipped: true,
    } satisfies Language);
  const override = answerLanguageOverride ? languageOf(answerLanguageOverride) : null;
  return {
    interfaceLanguage,
    answerLanguage: override ?? interfaceLanguage,
    worthOffering:
      override === null &&
      interfaceLanguage.modelSupport === "thin" &&
      interfaceLanguage.code !== FALLBACK_ANSWER_LANGUAGE_CODE,
  };
}

/**
 * Appended to system prompts. `firm` is the second attempt, used after a reply came back in
 * the wrong language — same request, less room to drift.
 */
export function buildLanguageDirective(language: Language, options?: { firm?: boolean }): string {
  const name = `${language.endonym}（${language.code}）`;
  if (options?.firm) {
    return `【语言】上一次回答用错了语言。这一次必须全程使用 ${name} 书写，包括标题、列表、代码注释之外的一切文字。不要混入其他语言的句子。`;
  }
  return `【语言】全程使用 ${name} 书写你的回答；专有名词、代码与公式保持原样。`;
}
