/**
 * Purpose: the table of languages the app can run in — how each one writes itself, which
 * direction it runs, which script it needs fonts for, and how well the model writes it.
 * Adding a language means adding a row here plus a folder of message files.
 * Main exports: LANGUAGES, UI_LANGUAGE_CODES, languageOf, isLanguageCode.
 */

/** Right-to-left languages need `dir="rtl"` and logical CSS properties, nothing more. */
export type TextDirection = "ltr" | "rtl";

/** Which font stack the script needs — the app ships one stack per family, not per language. */
export type ScriptFamily =
  | "latin"
  | "hanzi"
  | "arabic"
  | "devanagari"
  | "bengali"
  | "ethiopic"
  | "cyrillic";

/**
 * How well the model writes this language, as an editorial judgement — NOT a benchmark score
 * and never shown to the user. Its only job is deciding whether to offer, in one plain
 * sentence, to keep answering in a language the model handles better:
 *  - strong:   the model writes it as well as it writes anything
 *  - workable: usable, occasional awkwardness
 *  - thin:     understandable but noticeably weaker — worth telling the user about
 * The runtime reply-language check (see replyLanguage.ts) is what actually keeps us honest;
 * a wrong row here costs one sentence of advice, nothing more.
 */
export type ModelLanguageSupport = "strong" | "workable" | "thin";

export interface Language {
  /** BCP-47 tag used everywhere: settings, message folders, Intl. */
  code: string;
  /** The language's name in itself — what goes in the picker (never a translated name). */
  endonym: string;
  /** ISO 639-3 codes franc may return for this language. */
  detectionCodes: string[];
  direction: TextDirection;
  script: ScriptFamily;
  modelSupport: ModelLanguageSupport;
  /** False while its message files are incomplete: it stays out of the picker. */
  shipped: boolean;
}

/**
 * Two languages ship complete today. The rest are listed because the work to add them is a
 * folder of message files, not a code change — and because the answer-language machinery
 * (directive, detection, the "the model is weaker here" advice) has to be right for
 * languages we do not yet have an interface in: a user can already read in Swahili while
 * the interface is in English.
 */
export const LANGUAGES: readonly Language[] = [
  {
    code: "zh-CN",
    endonym: "简体中文",
    detectionCodes: ["cmn"],
    direction: "ltr",
    script: "hanzi",
    modelSupport: "strong",
    shipped: true,
  },
  {
    code: "en",
    endonym: "English",
    detectionCodes: ["eng"],
    direction: "ltr",
    script: "latin",
    modelSupport: "strong",
    shipped: true,
  },
  {
    code: "es",
    endonym: "Español",
    detectionCodes: ["spa"],
    direction: "ltr",
    script: "latin",
    modelSupport: "strong",
    shipped: false,
  },
  {
    code: "fr",
    endonym: "Français",
    detectionCodes: ["fra"],
    direction: "ltr",
    script: "latin",
    modelSupport: "strong",
    shipped: false,
  },
  {
    code: "pt",
    endonym: "Português",
    detectionCodes: ["por"],
    direction: "ltr",
    script: "latin",
    modelSupport: "strong",
    shipped: false,
  },
  {
    code: "ru",
    endonym: "Русский",
    detectionCodes: ["rus"],
    direction: "ltr",
    script: "cyrillic",
    modelSupport: "strong",
    shipped: false,
  },
  {
    code: "ar",
    endonym: "العربية",
    detectionCodes: ["arb"],
    direction: "rtl",
    script: "arabic",
    modelSupport: "workable",
    shipped: false,
  },
  {
    code: "hi",
    endonym: "हिन्दी",
    detectionCodes: ["hin"],
    direction: "ltr",
    script: "devanagari",
    modelSupport: "workable",
    shipped: false,
  },
  {
    code: "id",
    endonym: "Bahasa Indonesia",
    detectionCodes: ["ind"],
    direction: "ltr",
    script: "latin",
    modelSupport: "workable",
    shipped: false,
  },
  {
    code: "bn",
    endonym: "বাংলা",
    detectionCodes: ["ben"],
    direction: "ltr",
    script: "bengali",
    modelSupport: "thin",
    shipped: false,
  },
  {
    code: "sw",
    endonym: "Kiswahili",
    detectionCodes: ["swh"],
    direction: "ltr",
    script: "latin",
    modelSupport: "thin",
    shipped: false,
  },
  {
    code: "am",
    endonym: "አማርኛ",
    detectionCodes: ["amh"],
    direction: "ltr",
    script: "ethiopic",
    modelSupport: "thin",
    shipped: false,
  },
];

export const DEFAULT_LANGUAGE_CODE = "zh-CN";

/** Languages whose interface is complete — the only ones the picker offers. */
export const UI_LANGUAGE_CODES: readonly string[] = LANGUAGES.filter(
  (language) => language.shipped,
).map((language) => language.code);

export function languageOf(code: string): Language | null {
  return LANGUAGES.find((language) => language.code === code) ?? null;
}

export function isLanguageCode(code: string): boolean {
  return languageOf(code) !== null;
}

/** The language the app falls back to when the model is thin in the chosen one. */
export const FALLBACK_ANSWER_LANGUAGE_CODE = "en";
