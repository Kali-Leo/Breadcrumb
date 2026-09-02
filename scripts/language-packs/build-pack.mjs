#!/usr/bin/env node
/**
 * Purpose: builds a language pack for any pair listed in pairs.json from Wiktionary (via the
 * Kaikki extracts) plus a source-language frequency list — the general path that replaced the
 * CC-CEDICT-only builder, which could only ever produce zh→en.
 *
 * Two directions, one download each way round:
 *  - `x:en`  — you read your own language and meet English words. Source lemmas are the X
 *              entries of the X extract; the target is their English gloss; the reading is the
 *              English word's IPA from CMUdict.
 *  - `en:x`  — you read English and meet X words. The same extract is read backwards: an X
 *              entry glossed by a single English word W becomes the entry for W, and the
 *              reading is that X word's own IPA.
 *
 * A pair only exists if both halves of its data exist: without a frequency list there is no
 * defensible answer to "which word should this learner meet first", so the pair is refused
 * rather than shipped in a degraded state (see the repo's language-data issue).
 *
 * Usage: `node build-pack.mjs <pairId>` or `node build-pack.mjs --all`.
 * Side effects: downloads into .cache/, writes dist/language-packs/*.json and catalog.json.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  arpabetToIpa,
  BLACKLIST_SUBSTRINGS,
  ENGLISH_FUNCTION_WORDS,
  glossCandidates,
} from "./entry-builder.mjs";
import { downloadCachedStream, kaikkiUrlFor, streamKaikkiEntries } from "./kaikki.mjs";
import {
  downloadCached,
  lockedSource,
  parseCmudict,
  parseFrequencyList,
  requireLockedSource,
} from "./parsers.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(HERE, ".cache");
const DIST_DIR = path.join(HERE, "..", "..", "dist", "language-packs");
const CATALOG_PATH = path.join(
  HERE,
  "..",
  "..",
  "apps",
  "desktop",
  "src",
  "assets",
  "language-packs",
  "catalog.json",
);
const PAIRS_PATH = path.join(HERE, "pairs.json");
// GitHub sources are pinned to a commit, never to `master`: a branch is whatever the upstream
// account holds today, and this data ends up inside packs shipped to learners. The commit ids
// and every file's digest live in upstream.lock.json.
const HERMITDAVE_COMMIT = "525f9b560de45753a5ea01069454e72e9aa541c6";
const CMUDICT_COMMIT = "74790861f652b15e4ac49015a90074ad62a27690";
const CMUDICT_URL = `https://raw.githubusercontent.com/cmusphinx/cmudict/${CMUDICT_COMMIT}/cmudict.dict`;
/** A hostile or broken upstream should not be able to fill the disk; the pinned size plus half
 * leaves room for an honest upstream that grew a little between re-pins. */
const SIZE_CEILING_FACTOR = 1.5;

/** English targets must be words a learner will actually meet again; same cutoff the zh→en
 * build settled on. */
const EN_FREQUENCY_CUTOFF = 20000;
/** Below this many weavable entries a pack is not worth offering — the weave would keep
 * showing the same handful of words. */
const MIN_T1SAFE_ENTRIES = 1500;
/** Kaikki part-of-speech names → the pack's coarse tag. */
const POS_MAP = {
  noun: "n",
  verb: "v",
  adj: "adj",
  adv: "adv",
  name: "name",
  num: "num",
  pron: "pron",
  prep: "prep",
  conj: "conj",
  intj: "intj",
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

/** Object with keys in alphabetical order — byte-identical output across rebuilds. */
function sortedObject(object) {
  const out = Object.create(null); // same reason as the accumulators: the keys are upstream text
  for (const key of Object.keys(object).sort()) out[key] = object[key];
  return out;
}

/** hermitdave's FrequencyWords has two editions and not every language is in both. */
async function loadFrequencyList(spec) {
  for (const edition of spec.editions) {
    const url = `https://raw.githubusercontent.com/hermitdave/FrequencyWords/${HERMITDAVE_COMMIT}/content/${edition}/${spec.code}/${spec.code}_50k.txt`;
    const filename = `freq-${spec.code}-${edition}.txt`;
    const source = lockedSource(url);
    if (source === null) {
      console.log(`  ${spec.code}/${edition} is not pinned in upstream.lock.json, skipping`);
      continue;
    }
    try {
      const bytes = await downloadCached(url, CACHE_DIR, filename, source.sha256);
      const ranks = parseFrequencyList(bytes.toString("utf-8"));
      if (ranks.size >= spec.minimumWords) return ranks;
      console.log(
        `  frequency list ${spec.code}/${edition} has only ${ranks.size} words, skipping`,
      );
    } catch {
      console.log(`  no frequency list at ${spec.code}/${edition}`);
    }
  }
  return null;
}

/** The first sense's first gloss, which is where Wiktionary puts the dominant meaning. */
function primaryGlossOf(entry) {
  for (const sense of entry.senses ?? []) {
    for (const gloss of sense.glosses ?? []) {
      if (typeof gloss === "string" && gloss.trim().length > 0) return gloss;
    }
  }
  return null;
}

function allGlossesOf(entry) {
  const glosses = [];
  for (const sense of entry.senses ?? []) {
    for (const gloss of sense.glosses ?? []) {
      if (typeof gloss === "string" && gloss.trim().length > 0) glosses.push(gloss);
    }
  }
  return glosses;
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

function isRedirectOrLabel(entry) {
  const gloss = primaryGlossOf(entry);
  if (gloss === null) return true;
  const lowered = gloss.toLowerCase();
  return BLACKLIST_SUBSTRINGS.some((keyword) => lowered.includes(keyword));
}

/**
 * Direction `x:en`. Source lemmas come from the X extract, ranked by the X frequency list;
 * their English gloss is the word the learner meets.
 */
async function buildTowardEnglish({ extractPath, sourceRanks, cmuMap, englishFrequent }) {
  // Null-prototype: `word` and `surface` below come straight off a remote JSONL, and a record
  // spelling either of them `__proto__` would otherwise overwrite the prototype instead of
  // adding a key — a silent hole in the pack rather than a visible failure.
  const entries = Object.create(null);
  const forms = Object.create(null);
  const stats = { candidates: 0, kept: 0, t1Safe: 0, withReading: 0 };

  for await (const raw of streamKaikkiEntries(extractPath)) {
    const word = typeof raw.word === "string" ? raw.word : null;
    if (word === null) continue;
    const freqRank = sourceRanks.get(word) ?? sourceRanks.get(word.toLowerCase());
    if (freqRank === undefined) continue;
    if (entries[word] !== undefined) continue;
    stats.candidates += 1;

    const glosses = allGlossesOf(raw);
    if (glosses.length === 0) continue;
    // Each gloss can offer several synonyms ("to learn; to study"); reading it as one string
    // dropped the entry entirely, which is what it did to 3,237 Chinese words before this was
    // found (2026-09-01).
    const normalized = glosses.flatMap((gloss) => glossCandidates(gloss));
    if (normalized.length === 0) continue;

    const [target, ...rest] = normalized;
    const altTargets = [...new Set(rest.map((item) => item.word))]
      .filter((candidate) => candidate !== target.word)
      .slice(0, 6);
    const phonemes = cmuMap.get(target.word);
    const reading = phonemes ? `/${arpabetToIpa(phonemes)}/` : "";

    const unsafe =
      isRedirectOrLabel(raw) ||
      raw.pos === "name" ||
      ENGLISH_FUNCTION_WORDS.has(target.word) ||
      !englishFrequent.has(target.word) ||
      glosses.length > 6;

    entries[word] = {
      target: target.word,
      pos: POS_MAP[raw.pos] ?? target.pos,
      reading,
      altTargets,
      freqRank,
      t1Safe: !unsafe,
    };
    stats.kept += 1;
    if (!unsafe) stats.t1Safe += 1;
    if (reading !== "") stats.withReading += 1;

    for (const form of raw.forms ?? []) {
      const surface = typeof form.form === "string" ? form.form.trim() : "";
      if (surface === "" || surface === word || surface.includes(" ")) continue;
      if (forms[surface] === undefined && entries[surface] === undefined) forms[surface] = word;
    }
  }
  return { entries, forms, stats };
}

/**
 * Direction `en:x`. The same extract read backwards: an X word glossed by a single English
 * word becomes that English word's entry, so the learner reading English meets the X word.
 * Only one X word may claim an English lemma — a lemma several X words translate is left
 * unsafe, because deterministic replacement would be picking a sense the sentence never chose.
 */
async function buildFromEnglish({ extractPath, sourceRanks, englishFrequent }) {
  const claims = new Map();
  for await (const raw of streamKaikkiEntries(extractPath)) {
    const word = typeof raw.word === "string" ? raw.word.trim() : "";
    if (word === "" || word.includes(" ")) continue;
    if (isRedirectOrLabel(raw) || raw.pos === "name") continue;
    const gloss = primaryGlossOf(raw);
    if (gloss === null) continue;
    // The first usable synonym of the dominant sense is the English lemma this word teaches.
    const normalized = glossCandidates(gloss)[0];
    if (normalized === undefined) continue;
    const lemma = normalized.word;
    if (!englishFrequent.has(lemma) || ENGLISH_FUNCTION_WORDS.has(lemma)) continue;
    const freqRank = sourceRanks.get(lemma);
    if (freqRank === undefined) continue;

    const existing = claims.get(lemma);
    if (existing === undefined) {
      claims.set(lemma, {
        target: word,
        pos: POS_MAP[raw.pos] ?? normalized.pos,
        reading: ipaOf(raw),
        altTargets: [],
        freqRank,
        claimants: 1,
      });
    } else if (existing.target !== word) {
      existing.claimants += 1;
      if (existing.altTargets.length < 6) existing.altTargets.push(word);
    }
  }

  const entries = Object.create(null); // `lemma` is upstream text; see buildTowardEnglish.
  const stats = { candidates: claims.size, kept: 0, t1Safe: 0, withReading: 0 };
  for (const [lemma, claim] of claims) {
    const t1Safe = claim.claimants === 1;
    entries[lemma] = {
      target: claim.target,
      pos: claim.pos,
      reading: claim.reading,
      altTargets: claim.altTargets,
      freqRank: claim.freqRank,
      t1Safe,
    };
    stats.kept += 1;
    if (t1Safe) stats.t1Safe += 1;
    if (claim.reading !== "") stats.withReading += 1;
  }
  // English inflections would need a second extract; the tokenizer falls back to exact and
  // lowercased matches, so an empty form table costs recall, never correctness.
  return { entries, forms: Object.create(null), stats };
}

async function buildPair(pair, shared) {
  const [sourceLang, targetLang] = pair.id.split(":");
  console.log(`\n${pair.id} — ${pair.name}`);
  const sourceFrequency = await loadFrequencyList(pair.frequency);
  if (sourceFrequency === null) {
    console.log(`  refused: no frequency list for ${sourceLang}`);
    return null;
  }
  const kaikkiUrl = kaikkiUrlFor(pair.kaikkiLanguage);
  const kaikkiSource = lockedSource(kaikkiUrl);
  if (kaikkiSource === null) {
    // Refusing beats building: an unpinned extract is one nobody has checked, and whatever it
    // says would go out to learners as a dictionary. Pin it in upstream.lock.json to enable it.
    console.log(`  refused: ${kaikkiUrl} is not pinned in upstream.lock.json`);
    return null;
  }
  const extractPath = await downloadCachedStream(
    kaikkiUrl,
    CACHE_DIR,
    `kaikki-${pair.kaikkiLanguage.replaceAll(" ", "-").toLowerCase()}.jsonl`,
    kaikkiSource.sha256,
    Math.ceil(kaikkiSource.bytes * SIZE_CEILING_FACTOR),
  );

  const built =
    targetLang === "en"
      ? await buildTowardEnglish({
          extractPath,
          sourceRanks: sourceFrequency,
          cmuMap: shared.cmuMap,
          englishFrequent: shared.englishFrequent,
        })
      : await buildFromEnglish({
          extractPath,
          sourceRanks: sourceFrequency,
          englishFrequent: shared.englishFrequent,
        });

  console.log(
    `  candidates ${built.stats.candidates} · kept ${built.stats.kept} · weavable ${built.stats.t1Safe} · with pronunciation ${built.stats.withReading}`,
  );
  if (built.stats.t1Safe < MIN_T1SAFE_ENTRIES) {
    console.log(
      `  refused: only ${built.stats.t1Safe} weavable entries (need ${MIN_T1SAFE_ENTRIES})`,
    );
    return null;
  }

  const pack = {
    schemaVersion: 1,
    id: pair.id,
    sourceLang,
    targetLang,
    version: shared.version,
    attribution: [
      "Wiktionary (via kaikki.org), CC BY-SA 4.0",
      "OpenSubtitles frequency lists (hermitdave/FrequencyWords), CC BY-SA 4.0",
      ...(targetLang === "en" ? ["CMUdict (Carnegie Mellon University), BSD-2-Clause"] : []),
    ],
    capabilities: { t1Safe: true, rtl: pair.rtl === true, ruby: pair.ruby === true },
    forms: sortedObject(built.forms),
    entries: sortedObject(built.entries),
  };

  fs.mkdirSync(DIST_DIR, { recursive: true });
  const fileName = `${sourceLang}-${targetLang}.json`;
  const filePath = path.join(DIST_DIR, fileName);
  const json = JSON.stringify(pack);
  fs.writeFileSync(filePath, json);
  const bytes = Buffer.byteLength(json);
  console.log(`  wrote ${fileName} (${(bytes / 1_048_576).toFixed(2)} MB)`);

  return {
    id: pair.id,
    file: fileName,
    sourceLang,
    targetLang,
    version: shared.version,
    entryCount: Object.keys(pack.entries).length,
    weavableCount: built.stats.t1Safe,
    bytes,
    sha256: crypto.createHash("sha256").update(json).digest("hex"),
  };
}

async function main() {
  const config = readJson(PAIRS_PATH);
  const requested = process.argv[2];
  if (requested === undefined) {
    console.error("usage: node build-pack.mjs <pairId> | --all");
    process.exit(1);
  }
  const pairs =
    requested === "--all" ? config.pairs : config.pairs.filter((pair) => pair.id === requested);
  if (pairs.length === 0) {
    console.error(`unknown pair: ${requested}`);
    process.exit(1);
  }

  const now = new Date();
  const version = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
  const cmuMap = parseCmudict(
    (
      await downloadCached(
        CMUDICT_URL,
        CACHE_DIR,
        "cmudict.dict",
        requireLockedSource(CMUDICT_URL).sha256,
      )
    ).toString("utf-8"),
  );
  const englishRanks = await loadFrequencyList(config.englishFrequency);
  if (englishRanks === null) throw new Error("the English frequency list is required");
  const englishFrequent = new Set(
    [...englishRanks.entries()]
      .filter(([, rank]) => rank <= EN_FREQUENCY_CUTOFF)
      .map(([word]) => word),
  );

  const catalog = fs.existsSync(CATALOG_PATH)
    ? readJson(CATALOG_PATH)
    : { generatedAt: "", downloadBase: config.downloadBase, packs: [] };
  const byId = new Map(catalog.packs.map((entry) => [entry.id, entry]));

  for (const pair of pairs) {
    const built = await buildPair(pair, { cmuMap, englishFrequent, version });
    if (built === null) byId.delete(pair.id);
    else byId.set(built.id, built);
  }

  catalog.downloadBase = config.downloadBase;
  catalog.generatedAt = now.toISOString().slice(0, 10);
  catalog.packs = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`\ncatalog: ${catalog.packs.length} pack(s)`);
}

await main();
