#!/usr/bin/env node
/**
 * Purpose: builds the zh→en T1 language pack (spec 033) from CC-CEDICT, FrequencyWords, and
 * CMUdict, then writes it to apps/desktop/src/assets/language-packs/zh-en.json.
 * Main exports: none — this is a CLI entry point (`node build-zh-en.mjs`), zero side effects
 * besides cache downloads and the one output file.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { buildEntryForLemma } from "./entry-builder.mjs";
import { downloadCached, parseCedict, parseCmudict, parseFrequencyList } from "./parsers.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(HERE, ".cache");
const OUTPUT_PATH = path.join(
  HERE,
  "..",
  "..",
  "apps",
  "desktop",
  "src",
  "assets",
  "language-packs",
  "zh-en.json",
);
const CEDICT_URL =
  "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz";
const ZH_FREQ_URL =
  "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/zh_cn/zh_cn_50k.txt";
const EN_FREQ_URL =
  "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt";
const CMUDICT_URL =
  "https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict";

const MIN_T1SAFE = 2000;
const DEFAULT_EN_CUTOFF = 20000;
const LOOSENED_EN_CUTOFF = 30000;

/** Sorts an object's keys alphabetically, preserving field order within each value. */
function sortedObject(obj) {
  const out = {};
  for (const key of Object.keys(obj).sort()) out[key] = obj[key];
  return out;
}

/** Runs one full pass over the CEDICT groups with a given English-frequency cutoff, returning
 * the entries/forms maps plus per-run stats (kept/dropped counts, drop-reason tally). */
function runBuild({ cedictBySimplified, zhRank, cmuMap, enWordsOrdered, enFreqCutoff }) {
  const englishFrequencySet = new Set(enWordsOrdered.slice(0, enFreqCutoff));
  const entries = {};
  const forms = {};
  const stats = { candidates: 0, kept: 0, dropped: 0, t1Safe: 0, withReading: 0, reasons: {} };

  for (const [simplified, lines] of cedictBySimplified) {
    const freqRank = zhRank.get(simplified);
    if (freqRank === undefined) continue; // not in the zh top-50k: not an entry at all
    stats.candidates += 1;

    const { entry, tradForms, reasons } = buildEntryForLemma(
      simplified,
      lines,
      freqRank,
      cmuMap,
      englishFrequencySet,
    );
    for (const reason of reasons) stats.reasons[reason] = (stats.reasons[reason] ?? 0) + 1;

    if (!entry) {
      stats.dropped += 1;
      continue;
    }
    entries[simplified] = entry;
    stats.kept += 1;
    if (entry.t1Safe) stats.t1Safe += 1;
    if (entry.reading) stats.withReading += 1;
    for (const traditional of tradForms) {
      if (!(traditional in forms)) forms[traditional] = simplified;
    }
  }

  return { entries, forms, stats, enFreqCutoff };
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(path.join(HERE, ".gitignore"), ".cache/\n");

  console.log("Downloading source data (cached after first run)...");
  const [cedictGz, zhFreqText, enFreqText, cmudictText] = await Promise.all([
    downloadCached(CEDICT_URL, CACHE_DIR, "cedict_1_0_ts_utf-8_mdbg.txt.gz"),
    downloadCached(ZH_FREQ_URL, CACHE_DIR, "zh_cn_50k.txt").then((b) => b.toString("utf-8")),
    downloadCached(EN_FREQ_URL, CACHE_DIR, "en_50k.txt").then((b) => b.toString("utf-8")),
    downloadCached(CMUDICT_URL, CACHE_DIR, "cmudict.dict").then((b) => b.toString("utf-8")),
  ]);
  const cedictText = zlib.gunzipSync(cedictGz).toString("utf-8");

  console.log("Parsing sources...");
  const cedictBySimplified = parseCedict(cedictText);
  const zhRank = parseFrequencyList(zhFreqText);
  const cmuMap = parseCmudict(cmudictText);
  const enWordsOrdered = [...parseFrequencyList(enFreqText).keys()];

  console.log(`  CEDICT lemma groups: ${cedictBySimplified.size}`);
  console.log(`  zh frequency list: ${zhRank.size} words`);
  console.log(`  en frequency list: ${enWordsOrdered.length} words`);
  console.log(`  CMUdict entries: ${cmuMap.size}`);

  const buildArgs = { cedictBySimplified, zhRank, cmuMap, enWordsOrdered };
  let result = runBuild({ ...buildArgs, enFreqCutoff: DEFAULT_EN_CUTOFF });
  if (result.stats.t1Safe < MIN_T1SAFE) {
    console.log(
      `  t1Safe count ${result.stats.t1Safe} below floor ${MIN_T1SAFE}; ` +
        `loosening English-frequency cutoff ${DEFAULT_EN_CUTOFF} -> ${LOOSENED_EN_CUTOFF}`,
    );
    result = runBuild({ ...buildArgs, enFreqCutoff: LOOSENED_EN_CUTOFF });
  }

  const pack = {
    schemaVersion: 1,
    id: "zh:en",
    sourceLang: "zh",
    targetLang: "en",
    version: "2026.08.12",
    attribution: [
      "CC-CEDICT © MDBG, CC BY-SA 4.0",
      "FrequencyWords (OpenSubtitles 2018) © Hermit Dave, CC BY-SA 4.0",
      "CMUdict © Carnegie Mellon University, BSD-2-Clause",
    ],
    capabilities: { t1Safe: true, rtl: false, ruby: false },
    forms: sortedObject(result.forms),
    entries: sortedObject(result.entries),
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(pack));

  const { stats } = result;
  console.log("\n=== Build stats ===");
  console.log(`English frequency cutoff used: ${result.enFreqCutoff}`);
  console.log(`Candidates (in zh top-50k): ${stats.candidates}`);
  console.log(`Entries kept: ${stats.kept}`);
  console.log(`Entries dropped (no usable gloss): ${stats.dropped}`);
  console.log(`t1Safe entries: ${stats.t1Safe}`);
  console.log(`Entries with a reading: ${stats.withReading}`);
  console.log(`forms (traditional -> simplified): ${Object.keys(result.forms).length}`);
  console.log("Flag counts (an entry can carry more than one):");
  for (const [reason, count] of Object.entries(stats.reasons).sort()) {
    console.log(`  ${reason}: ${count}`);
  }
  console.log(`\nWrote ${OUTPUT_PATH}`);
  console.log(`File size: ${fs.statSync(OUTPUT_PATH).size} bytes`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
