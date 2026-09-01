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
  | "cyrillic"
  | "kana"
  | "hangul";

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
 * Ten ship complete (2026-09-01). Amharic is listed but not shipped: writing an interface in
 * a language nobody here can check reads worse than not offering it, so it waits for a
 * translation someone can vouch for (tracked in the repo's language-data issue). Adding a
 * language is a folder of message files plus a row here, not a code change. The
 * answer-language machinery (directive, detection, the "the model is weaker here" advice)
 * still covers languages we have no interface in: a reader can ask for answers in a language
 * the interface does not speak.
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
    shipped: true,
  },
  {
    code: "fr",
    endonym: "Français",
    detectionCodes: ["fra"],
    direction: "ltr",
    script: "latin",
    modelSupport: "strong",
    shipped: true,
  },
  {
    code: "pt",
    endonym: "Português",
    detectionCodes: ["por"],
    direction: "ltr",
    script: "latin",
    modelSupport: "strong",
    shipped: true,
  },
  {
    code: "ru",
    endonym: "Русский",
    detectionCodes: ["rus"],
    direction: "ltr",
    script: "cyrillic",
    modelSupport: "strong",
    shipped: true,
  },
  {
    code: "ar",
    endonym: "العربية",
    detectionCodes: ["arb"],
    direction: "rtl",
    script: "arabic",
    modelSupport: "workable",
    shipped: true,
  },
  {
    code: "hi",
    endonym: "हिन्दी",
    detectionCodes: ["hin"],
    direction: "ltr",
    script: "devanagari",
    modelSupport: "workable",
    shipped: true,
  },
  {
    code: "id",
    endonym: "Bahasa Indonesia",
    detectionCodes: ["ind"],
    direction: "ltr",
    script: "latin",
    modelSupport: "workable",
    shipped: true,
  },
  {
    code: "bn",
    endonym: "বাংলা",
    detectionCodes: ["ben"],
    direction: "ltr",
    script: "bengali",
    modelSupport: "thin",
    shipped: true,
  },
  {
    code: "sw",
    endonym: "Kiswahili",
    detectionCodes: ["swh"],
    direction: "ltr",
    script: "latin",
    modelSupport: "thin",
    shipped: true,
  },
  {
    code: "de",
    endonym: "Deutsch",
    detectionCodes: ["deu"],
    direction: "ltr",
    script: "latin",
    modelSupport: "strong",
    shipped: false,
  },
  {
    code: "it",
    endonym: "Italiano",
    detectionCodes: ["ita"],
    direction: "ltr",
    script: "latin",
    modelSupport: "strong",
    shipped: false,
  },
  {
    code: "tr",
    endonym: "Türkçe",
    detectionCodes: ["tur"],
    direction: "ltr",
    script: "latin",
    modelSupport: "workable",
    shipped: false,
  },
  {
    code: "vi",
    endonym: "Tiếng Việt",
    detectionCodes: ["vie"],
    direction: "ltr",
    script: "latin",
    modelSupport: "workable",
    shipped: false,
  },
  {
    code: "ja",
    endonym: "日本語",
    detectionCodes: ["jpn"],
    direction: "ltr",
    script: "kana",
    modelSupport: "strong",
    shipped: false,
  },
  {
    code: "ko",
    endonym: "한국어",
    detectionCodes: ["kor"],
    direction: "ltr",
    script: "hangul",
    modelSupport: "strong",
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

/**
 * How to write a language's name for a reader: in the language itself where the table knows
 * it, otherwise the code. Region-less tags resolve to their regional row ("zh" → 简体中文),
 * which matters wherever a code arrives from outside the table — a language-pack id, say.
 * Display only: `languageOf`/`isLanguageCode` stay exact, so nothing is ever *stored* under a
 * tag the table does not literally hold.
 */
export function languageNameOf(code: string): string {
  const exact = languageOf(code);
  if (exact !== null) return exact.endonym;
  const base = code.toLowerCase().split("-")[0] ?? "";
  const prefixed = LANGUAGES.find((language) => language.code.toLowerCase().startsWith(`${base}-`));
  return prefixed?.endonym ?? code;
}

/** The language the app falls back to when the model is thin in the chosen one. */
export const FALLBACK_ANSWER_LANGUAGE_CODE = "en";
