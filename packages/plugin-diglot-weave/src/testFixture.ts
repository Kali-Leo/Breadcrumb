/**
 * Purpose: shared test fixtures — a tiny valid en:fr pack (Latin-script paths) and a tiny
 * zh:en pack (CJK paths). Test-only; not exported from the package entry.
 * Main exports: makeEnFrPack, makeZhEnPack.
 */
import { type LoadedLanguagePack, loadLanguagePack } from "./packSchema";

export function makeEnFrPack(): LoadedLanguagePack {
  return loadLanguagePack({
    schemaVersion: 1,
    id: "en:fr",
    sourceLang: "en",
    targetLang: "fr",
    version: "test",
    attribution: ["test fixture"],
    capabilities: { t1Safe: true, rtl: false, ruby: false },
    forms: { books: "book", reading: "read" },
    entries: {
      book: {
        target: "livre",
        pos: "n",
        reading: "/livʁ/",
        altTargets: ["bouquin"],
        freqRank: 300,
        t1Safe: true,
      },
      "book club": {
        target: "club-de-lecture",
        pos: "n",
        reading: "",
        altTargets: [],
        freqRank: 9000,
        t1Safe: false,
      },
      read: {
        target: "lire",
        pos: "v",
        reading: "/liʁ/",
        altTargets: [],
        freqRank: 500,
        t1Safe: true,
      },
      tome: {
        target: "livre",
        pos: "n",
        reading: "/livʁ/",
        altTargets: [],
        freqRank: 8000,
        t1Safe: true,
      },
      rare: {
        target: "rare",
        pos: "adj",
        reading: "",
        altTargets: [],
        freqRank: 4000,
        t1Safe: false,
      },
    },
  });
}

export function makeZhEnPack(): LoadedLanguagePack {
  return loadLanguagePack({
    schemaVersion: 1,
    id: "zh:en",
    sourceLang: "zh",
    targetLang: "en",
    version: "test",
    attribution: ["test fixture"],
    capabilities: { t1Safe: true, rtl: false, ruby: false },
    forms: { 書本: "书本" },
    entries: {
      朋友: {
        target: "friend",
        pos: "n",
        reading: "/fɹɛnd/",
        altTargets: [],
        freqRank: 120,
        t1Safe: true,
      },
      喜欢: {
        target: "like",
        pos: "v",
        reading: "/laɪk/",
        altTargets: [],
        freqRank: 80,
        t1Safe: true,
      },
      书本: {
        target: "book",
        pos: "n",
        reading: "/bʊk/",
        altTargets: [],
        freqRank: 900,
        t1Safe: true,
      },
      书籍: {
        target: "book",
        pos: "n",
        reading: "/bʊk/",
        altTargets: [],
        freqRank: 1500,
        t1Safe: true,
      },
    },
  });
}
