/**
 * Purpose: the end-to-end weave invariants that only a non-Latin, non-Chinese script can
 * break. Every fixture before 2026-09-07 was en:fr or zh:en, so the whole pipeline was only
 * ever driven over two punctuation systems and one direction of text; these tests drive it
 * over a right-to-left target (id:ar), a Cyrillic source (ru:en) and an abugida whose
 * letters carry combining vowel signs (bn:en), using slices of the REAL packs.
 *
 * Two of these fail against the code as it stood on 2026-09-06:
 *  - clause segmentation saw zero boundaries in Bengali (its danda was not a clause breaker),
 *    so the dispersion rule collapsed the whole message into clause 0 and only one word could
 *    ever be woven, however long the message;
 *  - the same for Arabic's ، and ؟, which is why an Arabic-SOURCE pair is here and not just
 *    an Arabic-target one: a Latin sentence woven with Arabic words never exercises Arabic
 *    punctuation at all.
 * Sentences below are written with each language's own sentence-final punctuation for that
 * reason — an Arabic test sentence ended with "." would pass either way and prove nothing.
 */
import { describe, expect, it } from "vitest";
import { extractCandidates } from "./candidates";
import { resolveLemma } from "./packSchema";
import { applyPatches, buildPatches, verifyPatches } from "./replace";
import type { ScheduledReplacement } from "./scheduler";
import { makeBnEnPack, makeRuEnPack } from "./testFixturePacks";
import { makeArEnPack, makeIdArPack } from "./testFixturePacksRtl";
import { tokenizeMessage } from "./tokenize";

/** Sentences written in each fixture's SOURCE language, each with three clauses closed by
 * that language's own punctuation, and each containing lemmas the pack slice knows. */
const CASES = [
  {
    name: "id:ar (Latin source, right-to-left target)",
    pack: makeIdArPack,
    lang: "id",
    message: "Mungkin dia di rumah, banyak orang pergi malam ini? Saya tidak tahu.",
    expectedLemmas: ["mungkin", "rumah", "banyak", "malam"],
  },
  {
    name: "ru:en (Cyrillic source)",
    pack: makeRuEnPack,
    lang: "ru",
    message: "Мама ещё дома, но парень никогда не звонит; я снова жду.",
    expectedLemmas: ["мама", "ещё", "парень", "никогда"],
  },
  {
    name: "ar:en (right-to-left source, ؟ and ، clauses)",
    pack: makeArEnPack,
    lang: "ar",
    message: "ربما سأراك اليوم، أنا آسف جدا؟ الليلة شيء آخر تماما.",
    expectedLemmas: ["ربما", "اليوم", "آسف", "الليلة", "شيء"],
  },
  {
    name: "bn:en (Bengali abugida source, danda-delimited clauses)",
    pack: makeBnEnPack,
    lang: "bn",
    message: "বাবা এক দিন এসেছিলেন। আমি তাঁকে দেখা করেছি। আমার সাহায্য দরকার।",
    expectedLemmas: ["বাবা", "এক", "দেখা", "সাহায্য"],
  },
] as const;

/** Splits on extended grapheme clusters — the unit a reader sees. A Bengali or Devanagari
 * "letter" is regularly several UTF-16 code units, so a span that is valid in code units can
 * still cut a glyph in half. */
function graphemeBoundaries(text: string): Set<number> {
  const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });
  const boundaries = new Set<number>([0]);
  for (const { index, segment } of segmenter.segment(text)) {
    boundaries.add(index + segment.length);
  }
  return boundaries;
}

function scheduleEverythingKnown(
  message: string,
  lang: string,
  pack: ReturnType<typeof makeIdArPack>,
) {
  const tokens = tokenizeMessage(message, lang);
  const candidates = extractCandidates(tokens, pack);
  // One per clause, mirroring the dispersion rule, so the scheduled set is realistic.
  const perClause = new Map<number, (typeof candidates)[number]>();
  for (const candidate of candidates) {
    if (!perClause.has(candidate.clauseIndex)) perClause.set(candidate.clauseIndex, candidate);
  }
  const scheduled: ScheduledReplacement[] = [...perClause.values()]
    .sort((a, b) => a.start - b.start)
    .map((candidate) => ({ ...candidate, kind: "new" as const, score: 1 }));
  return { tokens, candidates, scheduled };
}

describe.each(CASES)(
  "cross-script weave — $name",
  ({ pack: makePack, lang, message, expectedLemmas }) => {
    const pack = makePack();

    it("segments the message into more than one clause using this language's own punctuation", () => {
      const tokens = tokenizeMessage(message, lang);
      const clauseCount = Math.max(...tokens.map((token) => token.clauseIndex)) + 1;
      expect(clauseCount).toBeGreaterThan(1);
    });

    it("resolves this script's surface forms back to pack lemmas", () => {
      const tokens = tokenizeMessage(message, lang);
      const resolved = new Set(
        tokens
          .filter((token) => token.isWordLike)
          .map((token) => resolveLemma(token.text, pack))
          .filter((lemma): lemma is string => lemma !== null),
      );
      for (const lemma of expectedLemmas) expect(resolved).toContain(lemma);
    });

    it("builds patches whose spans reproduce the original text exactly", () => {
      const { scheduled } = scheduleEverythingKnown(message, lang, pack);
      expect(scheduled.length).toBeGreaterThan(1);
      const patches = buildPatches(message, scheduled, pack);
      expect(patches.length).toBe(scheduled.length);
      expect(verifyPatches(message, patches)).toBe(true);
      for (const patch of patches) {
        expect(message.slice(patch.start, patch.end)).toBe(patch.original);
      }
    });

    it("never cuts a grapheme cluster in half", () => {
      const { scheduled } = scheduleEverythingKnown(message, lang, pack);
      const boundaries = graphemeBoundaries(message);
      for (const patch of buildPatches(message, scheduled, pack)) {
        expect(boundaries.has(patch.start)).toBe(true);
        expect(boundaries.has(patch.end)).toBe(true);
      }
    });

    it("renders segments that put the untouched text back together byte for byte", () => {
      const { scheduled } = scheduleEverythingKnown(message, lang, pack);
      const segments = applyPatches(message, buildPatches(message, scheduled, pack));
      expect(segments).not.toBeNull();
      const rebuilt = (segments ?? [])
        .map((segment) => (segment.kind === "text" ? segment.text : segment.patch.original))
        .join("");
      expect(rebuilt).toBe(message);
    });

    it("weaves a replacement written in the target language's own script", () => {
      const { scheduled } = scheduleEverythingKnown(message, lang, pack);
      const patches = buildPatches(message, scheduled, pack);
      expect(patches.length).toBeGreaterThan(0);
      for (const patch of patches) {
        expect(patch.replacement).toBe(pack.pack.entries[patch.lemma]?.target);
        expect(patch.replacement).not.toBe(patch.original);
      }
    });
  },
);

describe("right-to-left packs", () => {
  it("declares rtl so the renderer can set dir on the woven span", () => {
    expect(makeIdArPack().pack.capabilities.rtl).toBe(true);
    expect(makeRuEnPack().pack.capabilities.rtl).toBe(false);
    expect(makeBnEnPack().pack.capabilities.rtl).toBe(false);
  });

  it("weaves an Arabic-script word into a Latin-script sentence without disturbing the offsets", () => {
    const pack = makeIdArPack();
    const message = "Mungkin dia di rumah malam ini.";
    const { scheduled } = scheduleEverythingKnown(message, "id", pack);
    const patches = buildPatches(message, scheduled, pack);
    expect(patches.length).toBeGreaterThan(0);
    // The replacement runs right-to-left while the span it covers runs left-to-right: the
    // patch is a display instruction, so the underlying offsets must stay in source order.
    expect(patches.map((patch) => patch.start)).toEqual(
      [...patches.map((patch) => patch.start)].sort((a, b) => a - b),
    );
    for (const patch of patches) {
      expect(/[؀-ۿ]/.test(patch.replacement)).toBe(true);
      expect(/[؀-ۿ]/.test(patch.original)).toBe(false);
    }
  });
});
