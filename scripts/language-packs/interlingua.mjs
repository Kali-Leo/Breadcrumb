#!/usr/bin/env node
/**
 * Purpose: reduces one Kaikki extract to the only part the pair builder needs — every word, its
 * English gloss keys, its part of speech, whether it is a dictionary form or somebody else's
 * conjugation, its own IPA, its frequency rank and its inflected forms. The extracts run to a
 * gigabyte each and there are seventeen of them, so each is streamed through here into a file
 * of a few megabytes; the pair builder never opens an extract, which is what makes an N x N
 * matrix affordable.
 *
 * English is reduced too, but differently: English IS the interlingua, so its bridge key is the
 * word itself rather than its glosses (see englishHalf.mjs).
 *
 * Usage: `node interlingua.mjs <langCode>`. Writes .cache/interlingua/<code>.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEnglishHalf } from "./englishHalf.mjs";
import { EN_FREQUENCY_CUTOFF, loadCmudict, loadFrequencyList } from "./frequency.mjs";
import { collectInflections } from "./inflections.mjs";
import { glossKeys } from "./interlinguaGloss.mjs";
import { downloadCachedStream, kaikkiUrlFor, streamKaikkiEntries } from "./kaikki.mjs";
import { lockedSource } from "./parsers.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(HERE, ".cache");
export const INTERLINGUA_DIR = path.join(CACHE_DIR, "interlingua");
const CONFIG = JSON.parse(fs.readFileSync(path.join(HERE, "languages.json"), "utf-8"));
/** A hostile or broken upstream should not be able to fill the disk; the pinned size plus half
 * leaves room for an honest upstream that grew a little between re-pins. */
const SIZE_CEILING_FACTOR = 1.5;
/** Past this many keys a word is a dictionary article, not a translation unit. */
const MAX_KEYS_PER_WORD = 12;

export function languageConfig(code) {
  const found = CONFIG.languages.find((language) => language.code === code);
  if (found === undefined) throw new Error(`unknown language: ${code}`);
  return found;
}

export const ALL_LANGUAGES = CONFIG.languages;
export const DOWNLOAD_BASE = CONFIG.downloadBase;
export function interlinguaPath(code) {
  return path.join(INTERLINGUA_DIR, `${code}.json`);
}

/** The entry's own pronunciation, preferring plain IPA over dialect-tagged variants. */
function ipaOf(entry) {
  for (const sound of entry.sounds ?? []) {
    if (typeof sound.ipa === "string" && sound.ipa.length > 0) {
      return sound.ipa.startsWith("/") || sound.ipa.startsWith("[") ? sound.ipa : `/${sound.ipa}/`;
    }
  }
  return "";
}

/** Every gloss of every sense, in the order Wiktionary lists them: the first is the dominant
 * meaning, which is the only one the pair builder will weave with. */
function keysOf(entry) {
  const keys = [];
  for (const sense of entry.senses ?? []) {
    for (const gloss of sense.glosses ?? []) {
      if (typeof gloss !== "string") continue;
      for (const key of glossKeys(gloss)) if (!keys.includes(key)) keys.push(key);
    }
  }
  return keys.slice(0, MAX_KEYS_PER_WORD);
}

/** The path to this language's extract, refusing an upstream nobody has pinned. */
async function extractFor(language) {
  const url = kaikkiUrlFor(language.kaikkiLanguage);
  const pinned = lockedSource(url);
  if (pinned === null) {
    // Refusing beats building: an unpinned extract is one nobody has checked, and whatever it
    // says would go out to learners as a dictionary. Pin it in upstream.lock.json to enable it.
    throw new Error(`${url} is not pinned in upstream.lock.json`);
  }
  const slug = language.kaikkiLanguage.replaceAll(" ", "-").toLowerCase();
  return downloadCachedStream(
    url,
    CACHE_DIR,
    `kaikki-${slug}.jsonl`,
    pinned.sha256,
    Math.ceil(pinned.bytes * SIZE_CEILING_FACTOR),
  );
}

/**
 * One language's half. Words are kept only when the frequency list ranks them — a word nobody
 * says is a word no learner needs — except for a language whose list is too short to filter
 * with (hi, sw), where the list only orders what it happens to cover.
 */
async function reduceExtract(extractPath, ranks, filterByRank) {
  // Null-prototype: `word` and `surface` come straight off a remote JSONL, and a record
  // spelling either of them `__proto__` would overwrite the prototype instead of adding a key.
  const words = Object.create(null);
  const formsOf = Object.create(null);
  const sets = { inflected: new Set(), gendered: new Set() };
  for await (const raw of streamKaikkiEntries(extractPath)) {
    const word = typeof raw.word === "string" ? raw.word.trim() : "";
    if (word === "" || word.includes(" ")) continue;
    collectInflections(raw, word, sets, formsOf);
    if (raw.pos === "name") continue;
    const rank = ranks?.get(word) ?? ranks?.get(word.toLowerCase()) ?? null;
    if (filterByRank && rank === null) continue;
    const keys = keysOf(raw);
    if (keys.length === 0) continue;

    const existing = words[word];
    if (existing === undefined) {
      words[word] = { p: raw.pos ?? "", k: keys, i: ipaOf(raw), r: rank, x: 0, g: 0 };
      continue;
    }
    for (const key of keys) {
      if (existing.k.length < MAX_KEYS_PER_WORD && !existing.k.includes(key)) existing.k.push(key);
    }
    if (existing.i === "") existing.i = ipaOf(raw);
    if (existing.p === "") existing.p = raw.pos ?? "";
  }

  // The flag is applied last because a surface can be read as a lemma long before the entry
  // that conjugates it comes past — French `est` is the noun "east" thousands of lines before
  // `être` lists it.
  let inflectedWords = 0;
  for (const word of Object.keys(words)) {
    if (sets.gendered.has(word)) words[word].g = 1;
    if (!sets.inflected.has(word)) continue;
    words[word].x = 1;
    inflectedWords += 1;
  }
  const forms = Object.create(null);
  for (const surface of Object.keys(formsOf)) {
    if (words[surface] === undefined) forms[surface] = formsOf[surface];
  }
  return { words, forms, inflectedCount: inflectedWords };
}

async function main() {
  const code = process.argv[2];
  if (code === undefined) {
    console.error("usage: node interlingua.mjs <langCode>");
    process.exit(1);
  }
  const language = languageConfig(code);
  console.log(`\n${code} — ${language.kaikkiLanguage}`);
  let ranks = null;
  if (language.frequency !== null && language.frequency !== undefined) {
    ranks = await loadFrequencyList({ ...language.frequency, minimumWords: 1 }, CACHE_DIR);
  }
  const usable = ranks !== null && ranks.size >= CONFIG.minimumWords;
  if (ranks !== null && !usable) {
    console.log(`  ${ranks.size} ranked words: enough to order by, not enough to filter with`);
  }
  const extractPath = await extractFor(language);
  const built =
    code === "en"
      ? await buildEnglishHalf({
          extractPath,
          ranks,
          cutoff: EN_FREQUENCY_CUTOFF,
          cmuMap: await loadCmudict(CACHE_DIR),
        })
      : await reduceExtract(extractPath, ranks, usable);

  fs.mkdirSync(INTERLINGUA_DIR, { recursive: true });
  const file = interlinguaPath(code);
  fs.writeFileSync(
    file,
    JSON.stringify({
      lang: code,
      kaikkiLanguage: language.kaikkiLanguage,
      rankedWords: ranks === null ? 0 : ranks.size,
      canBeSource: usable,
      words: built.words,
      forms: built.forms,
    }),
  );
  console.log(
    `  ${Object.keys(built.words).length} words (${built.inflectedCount} are somebody's ` +
      `conjugation) · ${Object.keys(built.forms).length} forms · ` +
      `${(fs.statSync(file).size / 1_048_576).toFixed(1)} MB · ` +
      `${usable ? "source or target" : "target only"}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
