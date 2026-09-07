/**
 * Purpose: the right-to-left fixtures, sliced from the REAL generated packs — Arabic as the
 * TARGET a Latin sentence is woven with (id:ar) and Arabic as the SOURCE being read (ar:en).
 * Both directions matter and they fail differently: a target-side bug is a rendering and
 * offset problem, a source-side bug is a segmentation problem, because Arabic prose is
 * punctuated with ، ؛ ؟ — marks a Latin-only clause-breaker list does not know.
 *
 * Provenance: entries copied verbatim from a pack build (scripts/language-packs), derived
 * from Wiktionary via kaikki.org (CC BY-SA 4.0), the hermitdave/FrequencyWords
 * OpenSubtitles lists (CC BY-SA 4.0) and CMUdict (BSD-2-Clause). The `،` row in the ar:en
 * slice is not a mistake — the real pack carries the comma as a non-t1Safe entry, and a
 * fixture that quietly tidied it away would hide the case where a clause breaker is also a
 * dictionary key.
 * Main exports: makeIdArPack, makeArEnPack.
 */
import { type LoadedLanguagePack, loadLanguagePack } from "./packSchema";
import { PACK_ATTRIBUTION, PACK_ATTRIBUTION_WITH_CMUDICT } from "./testFixturePacks";

/** Latin source, right-to-left Arabic target: the only fixture where `capabilities.rtl` is
 * true, so it is the one that can catch a renderer or patch-offset bug that only shows up
 * when the replacement runs the other way from the sentence around it. */
export function makeIdArPack(): LoadedLanguagePack {
  return loadLanguagePack({
    schemaVersion: 1,
    id: "id:ar",
    sourceLang: "id",
    targetLang: "ar",
    version: "2026.09.04",
    attribution: PACK_ATTRIBUTION,
    capabilities: { t1Safe: true, rtl: true, ruby: false },
    forms: { banjak: "banyak", "malam-malam": "malam" },
    entries: {
      mungkin: {
        target: "ربما",
        pos: "adv",
        reading: "/rub.ba.maː/",
        altTargets: ["ممكن"],
        freqRank: 52,
        t1Safe: true,
      },
      banyak: {
        target: "كثيرا",
        pos: "adv",
        reading: "/ka.θiː.ran/",
        altTargets: [],
        freqRank: 74,
        t1Safe: true,
      },
      malam: {
        target: "ليلة",
        pos: "n",
        reading: "/laj.la/",
        altTargets: ["شمع"],
        freqRank: 100,
        t1Safe: true,
      },
      rumah: {
        target: "محل",
        pos: "n",
        reading: "/ma.ħall/",
        altTargets: ["مسكن"],
        freqRank: 125,
        t1Safe: true,
      },
      tidak: {
        target: "سلب",
        pos: "adv",
        reading: "",
        altTargets: ["رفض"],
        freqRank: 4,
        t1Safe: false,
      },
    },
  });
}

/** Arabic source: right-to-left prose, whose lemmas the reader actually types, and whose
 * `forms` table is dominated by romanisations — so resolveLemma has to cross scripts. */
export function makeArEnPack(): LoadedLanguagePack {
  return loadLanguagePack({
    schemaVersion: 1,
    id: "ar:en",
    sourceLang: "ar",
    targetLang: "en",
    version: "2026.09.04",
    attribution: PACK_ATTRIBUTION_WITH_CMUDICT,
    capabilities: { t1Safe: true, rtl: false, ruby: false },
    forms: { "al-yawma": "اليوم", rubbamā: "ربما", šayʔ: "شيء" },
    entries: {
      شيء: {
        target: "thing",
        pos: "n",
        reading: "/θˈɪŋ/",
        altTargets: [],
        freqRank: 32,
        t1Safe: true,
      },
      ربما: {
        target: "perhaps",
        pos: "adv",
        reading: "/pɚhˈæps/",
        altTargets: ["maybe"],
        freqRank: 69,
        t1Safe: true,
      },
      اليوم: {
        target: "today",
        pos: "adv",
        reading: "/tədˈeɪ/",
        altTargets: [],
        freqRank: 103,
        t1Safe: true,
      },
      آسف: {
        target: "sorry",
        pos: "adj",
        reading: "/sˈɑɹi/",
        altTargets: [],
        freqRank: 153,
        t1Safe: true,
      },
      الليلة: {
        target: "tonight",
        pos: "adv",
        reading: "/tənˈaɪt/",
        altTargets: [],
        freqRank: 180,
        t1Safe: true,
      },
      "،": {
        target: "comma",
        pos: "punct",
        reading: "/kˈɑmə/",
        altTargets: [],
        freqRank: 1,
        t1Safe: false,
      },
    },
  });
}
