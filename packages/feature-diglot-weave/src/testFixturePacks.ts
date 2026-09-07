/**
 * Purpose: test fixtures sliced from the REAL generated language packs, for the left-to-right
 * scripts the hand-written en:fr and zh:en fixtures cannot reach — a Cyrillic source (ru:en)
 * and a Bengali source whose letters carry combining vowel signs (bn:en). The right-to-left
 * pairs live in testFixturePacksRtl.ts. Test-only; not exported from the package entry.
 *
 * Provenance: every entry below is copied verbatim out of the 2026.09.04 pack build
 * (scripts/language-packs), which derives from Wiktionary via kaikki.org (CC BY-SA 4.0),
 * the hermitdave/FrequencyWords OpenSubtitles lists (CC BY-SA 4.0) and CMUdict
 * (BSD-2-Clause). Nothing here is hand-written: a hand-written "Arabic" entry proves the
 * fixture author can type Arabic, not that the pipeline can carry a real pack. Each slice is
 * the most frequent t1Safe lemmas plus the most frequent non-t1Safe one (the "known but
 * never woven" row) plus the forms that resolve to them.
 * Main exports: makeRuEnPack, makeBnEnPack, PACK_ATTRIBUTION, PACK_ATTRIBUTION_WITH_CMUDICT.
 */
import { type LoadedLanguagePack, loadLanguagePack } from "./packSchema";

export const PACK_ATTRIBUTION = [
  "Wiktionary (via kaikki.org), CC BY-SA 4.0",
  "OpenSubtitles frequency lists (hermitdave/FrequencyWords), CC BY-SA 4.0",
];
export const PACK_ATTRIBUTION_WITH_CMUDICT = [
  ...PACK_ATTRIBUTION,
  "CMUdict (Carnegie Mellon University), BSD-2-Clause",
];

/** Cyrillic source: a cased, heavily inflected, space-separated script — neither the Latin
 * nor the CJK assumption. Its `forms` table is the real pack's romanisation entries, so
 * resolveLemma is exercised across scripts, not just across inflections. */
export function makeRuEnPack(): LoadedLanguagePack {
  return loadLanguagePack({
    schemaVersion: 1,
    id: "ru:en",
    sourceLang: "ru",
    targetLang: "en",
    version: "2026.09.04",
    attribution: PACK_ATTRIBUTION_WITH_CMUDICT,
    capabilities: { t1Safe: true, rtl: false, ruby: false },
    forms: { ješčó: "ещё", máma: "мама", nikogdá: "никогда" },
    entries: {
      ещё: {
        target: "yet",
        pos: "adv",
        reading: "/jˈɛt/",
        altTargets: ["else"],
        freqRank: 96,
        t1Safe: true,
      },
      никогда: {
        target: "never",
        pos: "adv",
        reading: "/nˈɛvɚ/",
        altTargets: [],
        freqRank: 107,
        t1Safe: true,
      },
      мама: {
        target: "mama",
        pos: "n",
        reading: "/mˈɑmə/",
        altTargets: ["mummy", "mommy", "mum", "mom"],
        freqRank: 188,
        t1Safe: true,
      },
      парень: {
        target: "fellow",
        pos: "n",
        reading: "/fˈɛloʊ/",
        altTargets: ["chap", "bloke", "boyfriend"],
        freqRank: 219,
        t1Safe: true,
      },
      не: {
        target: "without",
        pos: "part",
        reading: "/wɪθˈaʊt/",
        altTargets: [],
        freqRank: 2,
        t1Safe: false,
      },
    },
  });
}

/** Bengali source: an abugida. Its lemmas are shorter in graphemes than in UTF-16 code units
 * (সাহায্য is 7 code units and 4 grapheme clusters), which is exactly the gap a patch offset
 * computed in one unit and applied in the other falls through. */
export function makeBnEnPack(): LoadedLanguagePack {
  return loadLanguagePack({
    schemaVersion: 1,
    id: "bn:en",
    sourceLang: "bn",
    targetLang: "en",
    version: "2026.09.04",
    attribution: PACK_ATTRIBUTION_WITH_CMUDICT,
    capabilities: { t1Safe: true, rtl: false, ruby: false },
    forms: { baba: "বাবা", dêkha: "দেখা", ek: "এক" },
    entries: {
      এক: {
        target: "one",
        pos: "num",
        reading: "/wˈʌn/",
        altTargets: [],
        freqRank: 55,
        t1Safe: true,
      },
      বাবা: {
        target: "father",
        pos: "n",
        reading: "/fˈɑðɚ/",
        altTargets: ["daddy", "papa"],
        freqRank: 92,
        t1Safe: true,
      },
      দেখা: {
        target: "see",
        pos: "v",
        reading: "/sˈi/",
        altTargets: [],
        freqRank: 106,
        t1Safe: true,
      },
      সাহায্য: {
        target: "help",
        pos: "n",
        reading: "/hˈɛlp/",
        altTargets: [],
        freqRank: 125,
        t1Safe: true,
      },
      না: {
        target: "incorrect",
        pos: "adv",
        reading: "/ɪnkɚˈɛkt/",
        altTargets: [],
        freqRank: 3,
        t1Safe: false,
      },
    },
  });
}
