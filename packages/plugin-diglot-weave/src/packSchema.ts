/**
 * Purpose: the language-pack contract (spec 033) — Zod schema every pack file must pass at
 * load time, plus the loaded in-memory shape with derived indexes (reverse target→lemmas).
 * Main exports: LanguagePackSchema, loadLanguagePack, resolveLemma, LanguagePack,
 * LoadedLanguagePack, PackEntry.
 */
import { z } from "zod";

/** A pack is a file on disk, but it is a *data* file — bounded so a corrupt or hostile one
 * fails the contract instead of being loaded whole. The shipped zh-en pack is ~25k entries
 * whose longest value is a couple of dozen characters, so both ceilings sit far above any
 * real pack. */
const MAX_TABLE_ENTRIES = 200_000;
const MAX_VALUE_LENGTH = 200;

function withinTableLimit(table: Record<string, unknown>): boolean {
  return Object.keys(table).length <= MAX_TABLE_ENTRIES;
}

/** One replaceable word: source lemma → its dominant target-language translation.
 * Only entries that passed the build-time T1 whitelist (single dominant sense, content
 * word, not a proper noun, single-word target) may set `t1Safe: true`. */
export const PackEntrySchema = z.object({
  /** The replacement word in the target language (single word, no spaces, for T1). */
  target: z.string().min(1).max(MAX_VALUE_LENGTH),
  /** Coarse part of speech tag, e.g. "n", "v", "adj" — display only. */
  pos: z.string().max(MAX_VALUE_LENGTH),
  /** Pronunciation of the target word (IPA preferred, romanization fallback, "" if none). */
  reading: z.string().max(MAX_VALUE_LENGTH),
  /** Other acceptable translations of the source lemma — used by guess grading. */
  altTargets: z.array(z.string().max(MAX_VALUE_LENGTH)),
  /** Source-language frequency rank (1 = most frequent) — drives introduction order. */
  freqRank: z.number().int().positive(),
  /** Build-time whitelist verdict; false entries are kept for lookup but never woven. */
  t1Safe: z.boolean(),
});

export const LanguagePackSchema = z.object({
  schemaVersion: z.literal(1),
  /** Pair id `${sourceLang}:${targetLang}` in BCP-47, e.g. "zh:en". */
  id: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]+)*:[a-z]{2,3}(-[A-Za-z0-9]+)*$/),
  sourceLang: z.string().min(2),
  targetLang: z.string().min(2),
  /** Pack build date, e.g. "2026.08.12". */
  version: z.string().min(1),
  /** License/attribution lines for every upstream data source (CC BY-SA etc). */
  attribution: z.array(z.string()).min(1),
  capabilities: z.object({
    /** Whether deterministic replacement is safe for this pair (analytic source language). */
    t1Safe: z.boolean(),
    /** Whether the target script renders right-to-left. */
    rtl: z.boolean(),
    /** Whether the target language wants ruby annotations (e.g. Japanese furigana). */
    ruby: z.boolean(),
  }),
  /** Inflected/variant surface form → source lemma (identity forms are omitted). */
  forms: z
    .record(z.string(), z.string().max(MAX_VALUE_LENGTH))
    .refine(withinTableLimit, { message: `forms must hold at most ${MAX_TABLE_ENTRIES} keys` }),
  /** Source lemma → entry. */
  entries: z
    .record(z.string(), PackEntrySchema)
    .refine(withinTableLimit, { message: `entries must hold at most ${MAX_TABLE_ENTRIES} keys` }),
});

export type PackEntry = z.infer<typeof PackEntrySchema>;
export type LanguagePack = z.infer<typeof LanguagePackSchema>;

/** A validated pack plus derived indexes the runtime needs on every message. */
export interface LoadedLanguagePack {
  pack: LanguagePack;
  /** target word (lowercased) → every source lemma translating to it (guess synonyms,
   * productive-use detection). */
  lemmasByTarget: Map<string, string[]>;
  /** t1Safe lemmas sorted by freqRank ascending — the new-word introduction queue. */
  introductionQueue: string[];
  /** lemma → its index in introductionQueue. The queue is thousands of entries long and
   * both the weave and every signal event need this lookup, so it is indexed once at load
   * instead of scanned (audit 2026-08-28 #11). */
  introductionRankByLemma: Map<string, number>;
}

/** Resolves a surface form to its dictionary lemma, or null when unknown. Shared by
 * candidate extraction, guess grading and confusion mining so all three agree on what
 * counts as "a word this pack knows". */
export function resolveLemma(surface: string, loaded: LoadedLanguagePack): string | null {
  const viaForms = loaded.pack.forms[surface];
  if (viaForms !== undefined) return viaForms;
  if (loaded.pack.entries[surface] !== undefined) return surface;
  const lowercased = surface.toLowerCase();
  if (lowercased !== surface && loaded.pack.entries[lowercased] !== undefined) return lowercased;
  return null;
}

/** Validates raw JSON (throws ZodError on contract violation) and builds derived indexes. */
export function loadLanguagePack(rawJson: unknown): LoadedLanguagePack {
  const parsed = LanguagePackSchema.parse(rawJson);
  // Prototype-free lookup tables: `forms`/`entries` are indexed by whatever word the message
  // contains, and "toString" / "constructor" are ordinary English words. On a plain object
  // those keys hit Object.prototype and resolveLemma would hand back a function.
  const pack: LanguagePack = {
    ...parsed,
    forms: Object.assign(Object.create(null) as Record<string, string>, parsed.forms),
    entries: Object.assign(Object.create(null) as Record<string, PackEntry>, parsed.entries),
  };
  const lemmasByTarget = new Map<string, string[]>();
  for (const [lemma, entry] of Object.entries(pack.entries)) {
    for (const target of [entry.target, ...entry.altTargets]) {
      const key = target.toLowerCase();
      const existing = lemmasByTarget.get(key) ?? [];
      existing.push(lemma);
      lemmasByTarget.set(key, existing);
    }
  }
  const introductionQueue = Object.entries(pack.entries)
    .filter(([, entry]) => entry.t1Safe)
    .sort((a, b) => a[1].freqRank - b[1].freqRank || a[0].localeCompare(b[0]))
    .map(([lemma]) => lemma);
  const introductionRankByLemma = new Map(introductionQueue.map((lemma, rank) => [lemma, rank]));
  return { pack, lemmasByTarget, introductionQueue, introductionRankByLemma };
}
