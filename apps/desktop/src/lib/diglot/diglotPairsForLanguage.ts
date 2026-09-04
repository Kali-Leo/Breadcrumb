/**
 * Purpose: which language pairs can be woven at all, given the language the AI writes its
 * answers in. A pack's word list is keyed by words of its SOURCE language and is tokenized
 * with that language's rules, so a pack whose source is not the language of the reply cannot
 * match a single word: it fails silently, with nothing on screen to say why. So the source is
 * not a choice — it follows the answer language, and the learner only picks what to learn.
 * Pure: no store, no database, no network. The store-side half is diglotLanguageSync.ts.
 * Main exports: baseLangOf, sourceLangForAnswer, pairsForSourceLang, correctPairForSourceLang,
 * diglotPickerView, SOURCE_LANGS_WITH_PACKS, DiglotPairOption.
 */
import { resolveAnswerLanguage } from "@breadcrumb/core-i18n";
import { BUNDLED_PAIR_ID, PACK_CATALOG } from "./languagePacks";

export interface DiglotPairOption {
  id: string;
  /** What the learner would be learning — the only thing the picker shows. */
  targetLang: string;
  /** Uncompressed size of the download; 0 for the pair that ships inside the app. */
  bytes: number;
}

export interface PairCorrection {
  /** The pair to weave with, or null when nothing on this machine can weave into this
   * language — the caller turns language learning off rather than let it pretend to work. */
  pairId: string | null;
  /** True when this is not the pair the learner was on. */
  changed: boolean;
}

const [BUNDLED_SOURCE = "", BUNDLED_TARGET = ""] = BUNDLED_PAIR_ID.split(":");

/** Pack ids carry bare language codes ("zh"); interface and answer languages carry tags
 * ("zh-CN"). This is the one place the two spellings are reconciled. */
export function baseLangOf(code: string): string {
  return code.toLowerCase().split("-")[0] ?? code;
}

/** The language a pack must read for the weave to match anything: the one the AI writes in. */
export function sourceLangForAnswer(
  interfaceLanguage: string,
  answerLanguageOverride: string | null,
): string {
  const choice = resolveAnswerLanguage(interfaceLanguage, answerLanguageOverride);
  return baseLangOf(choice.answerLanguage.code);
}

/** Everything learnable from one source language, the bundled pair first. */
export function pairsForSourceLang(sourceLang: string): DiglotPairOption[] {
  const options: DiglotPairOption[] = [];
  if (BUNDLED_SOURCE === sourceLang) {
    options.push({ id: BUNDLED_PAIR_ID, targetLang: BUNDLED_TARGET, bytes: 0 });
  }
  for (const pack of PACK_CATALOG) {
    if (pack.sourceLang !== sourceLang) continue;
    options.push({ id: pack.id, targetLang: pack.targetLang, bytes: pack.bytes });
  }
  return options;
}

/** Every language something can be learned FROM — named in the one sentence shown to
 * someone whose answer language has no word data at all. */
export const SOURCE_LANGS_WITH_PACKS: readonly string[] = [
  ...new Set([BUNDLED_SOURCE, ...PACK_CATALOG.map((pack) => pack.sourceLang)]),
];

/**
 * Where the pair has to move after the answer language changed: stay put when the pair
 * already reads that language, otherwise the first pair for it this machine has downloaded
 * (the bundled pair counts as downloaded, so a Chinese answer language always lands on it),
 * and otherwise nowhere.
 */
export function correctPairForSourceLang(input: {
  sourceLang: string;
  currentPairId: string;
  installedPairs: readonly string[];
}): PairCorrection {
  const options = pairsForSourceLang(input.sourceLang);
  if (options.some((option) => option.id === input.currentPairId)) {
    return { pairId: input.currentPairId, changed: false };
  }
  const ready = options.find((option) => input.installedPairs.includes(option.id));
  return { pairId: ready?.id ?? null, changed: true };
}

export interface DiglotPickerView {
  /** What the picker lists — target languages, in catalogue order. */
  options: DiglotPairOption[];
  /** The pair the picker shows as chosen, or null when the pair no longer reads this
   * language, in which case the picker asks for a choice instead of showing a stale one. */
  currentId: string | null;
  /** What the switch shows. On while nothing here can be woven would be a claim to work. */
  switchOn: boolean;
  /** True when the picker is on screen despite the switch being off: something can be
   * downloaded for this language, and picking it is the only thing to do here. */
  mustChoose: boolean;
  /** True when this language has no word data at all — one sentence, and no picker. */
  noPackForLanguage: boolean;
}

/** Everything the settings section decides from the answer language and the stored pair. */
export function diglotPickerView(input: {
  sourceLang: string;
  pairId: string;
  enabled: boolean;
}): DiglotPickerView {
  const options = pairsForSourceLang(input.sourceLang);
  const currentId = options.some((option) => option.id === input.pairId) ? input.pairId : null;
  return {
    options,
    currentId,
    switchOn: input.enabled && options.length > 0,
    mustChoose: options.length > 0 && currentId === null,
    noPackForLanguage: options.length === 0,
  };
}
