#!/usr/bin/env node
/**
 * Purpose: builds the whole N x N matrix of language pairs from the interlingua halves that
 * interlingua.mjs left in .cache/interlingua/. Every language that has a frequency list can be
 * read; every language at all can be learned; `zh:en` is left alone because the CC-CEDICT
 * pipeline (build-zh-en.mjs) makes a better one and ships it inside the app.
 *
 * A pair is refused, not degraded, when it comes out with too few weavable entries: below that
 * line the weave would keep showing the same handful of words, which teaches nothing and reads
 * as a broken feature.
 *
 * Usage: `node build-cross-pack.mjs --all` or `node build-cross-pack.mjs <sourceLang> [target]`.
 * Side effects: writes dist/language-packs/*.json and the desktop app's catalog.json.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCrossPack } from "./crossPack.mjs";
import { ALL_LANGUAGES, DOWNLOAD_BASE, interlinguaPath, languageConfig } from "./interlingua.mjs";

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
/** The pair the CC-CEDICT pipeline owns; rebuilding it here would be a downgrade. */
const BUNDLED_PAIR = "zh:en";
/** Below this many weavable entries a pack is not worth offering. Same line build-pack.mjs
 * draws — a pair that only clears it one way round is a real finding, not a reason to move it. */
const MIN_T1SAFE_ENTRIES = 1500;

/** Object with keys in alphabetical order — byte-identical output across rebuilds. */
function sortedObject(object) {
  const out = Object.create(null); // the keys are upstream text
  for (const key of Object.keys(object).sort()) out[key] = object[key];
  return out;
}

function loadHalf(code) {
  const file = interlinguaPath(code);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function attributionFor(sourceLang, targetLang) {
  const lines = [
    "Wiktionary (via kaikki.org), CC BY-SA 4.0",
    "OpenSubtitles frequency lists (hermitdave/FrequencyWords), CC BY-SA 4.0",
  ];
  if (sourceLang === "en" || targetLang === "en") {
    lines.push("CMUdict (Carnegie Mellon University), BSD-2-Clause");
  }
  return lines;
}

function writePack({ pair, sourceLang, targetLang, built, version }) {
  const targetConfig = languageConfig(targetLang);
  const pack = {
    schemaVersion: 1,
    id: pair,
    sourceLang,
    targetLang,
    version,
    attribution: attributionFor(sourceLang, targetLang),
    capabilities: {
      t1Safe: true,
      rtl: targetConfig.rtl === true,
      ruby: targetConfig.ruby === true,
    },
    forms: sortedObject(built.forms),
    entries: sortedObject(built.entries),
  };
  fs.mkdirSync(DIST_DIR, { recursive: true });
  const file = `${sourceLang}-${targetLang}.json`;
  const json = JSON.stringify(pack);
  fs.writeFileSync(path.join(DIST_DIR, file), json);
  return {
    id: pair,
    file,
    sourceLang,
    targetLang,
    version,
    entryCount: Object.keys(pack.entries).length,
    weavableCount: built.stats.t1Safe,
    bytes: Buffer.byteLength(json),
    sha256: crypto.createHash("sha256").update(json).digest("hex"),
  };
}

function buildPair(sourceLang, targetLang, halves, version, report) {
  const pair = `${sourceLang}:${targetLang}`;
  const source = halves.get(sourceLang);
  const target = halves.get(targetLang);
  if (source === undefined || target === undefined) {
    report.push({ pair, outcome: "no interlingua half built for one side" });
    return null;
  }
  if (!source.canBeSource) {
    report.push({ pair, outcome: `refused: no frequency list for ${sourceLang}` });
    return null;
  }
  const built = buildCrossPack({ source, target });
  const dropped = built.stats.formsOffered - Object.keys(built.forms).length;
  const line =
    `candidates ${built.stats.candidates} · kept ${built.stats.kept} · weavable ${built.stats.t1Safe} · with pronunciation ${built.stats.withReading}` +
    (dropped > 0 ? ` · ${dropped} rare-word forms dropped at the cap` : "");
  if (built.stats.t1Safe < MIN_T1SAFE_ENTRIES) {
    report.push({
      pair,
      outcome: `refused: only ${built.stats.t1Safe} weavable entries (need ${MIN_T1SAFE_ENTRIES})`,
      line,
    });
    return null;
  }
  const entry = writePack({ pair, sourceLang, targetLang, built, version });
  report.push({
    pair,
    outcome: `built ${entry.entryCount} entries (${(entry.bytes / 1_048_576).toFixed(2)} MB)`,
    line,
  });
  return entry;
}

function requestedPairs(argv) {
  const codes = ALL_LANGUAGES.map((language) => language.code);
  if (argv[0] === "--all") {
    return codes.flatMap((s) => codes.filter((t) => t !== s).map((t) => [s, t]));
  }
  if (argv[0] !== undefined && argv[1] !== undefined) return [[argv[0], argv[1]]];
  if (argv[0] !== undefined) return codes.filter((t) => t !== argv[0]).map((t) => [argv[0], t]);
  console.error("usage: node build-cross-pack.mjs --all | <sourceLang> [targetLang]");
  process.exit(1);
}

async function main() {
  const pairs = requestedPairs(process.argv.slice(2)).filter(
    ([s, t]) => `${s}:${t}` !== BUNDLED_PAIR,
  );
  const halves = new Map();
  for (const code of new Set(pairs.flat())) {
    const half = loadHalf(code);
    if (half !== null) halves.set(code, half);
    else console.log(`no interlingua half for ${code} — run interlingua.mjs ${code}`);
  }
  const now = new Date();
  const version = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;

  const catalog = fs.existsSync(CATALOG_PATH)
    ? JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"))
    : { generatedAt: "", downloadBase: DOWNLOAD_BASE, packs: [] };
  const byId = new Map(catalog.packs.map((pack) => [pack.id, pack]));

  const report = [];
  for (const [sourceLang, targetLang] of pairs) {
    const built = buildPair(sourceLang, targetLang, halves, version, report);
    if (built === null) byId.delete(`${sourceLang}:${targetLang}`);
    else byId.set(built.id, built);
    const last = report.at(-1);
    console.log(
      `${last.pair.padEnd(8)} ${last.outcome}${last.line === undefined ? "" : `\n         ${last.line}`}`,
    );
  }

  catalog.downloadBase = DOWNLOAD_BASE;
  catalog.generatedAt = now.toISOString().slice(0, 10);
  catalog.packs = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
  fs.writeFileSync(path.join(CACHE_DIR, "cross-report.json"), JSON.stringify(report, null, 2));
  console.log(`\ncatalog: ${catalog.packs.length} pack(s)`);
}

await main();
