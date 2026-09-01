#!/usr/bin/env node
/**
 * Purpose: builds packages/core-text's Chinese word list — the dictionary its segmenter does
 * maximum matching against. Two sources, both already in this repo:
 *   - the zh→en language pack's headwords and traditional forms (everyday vocabulary, from
 *     CC-CEDICT filtered by an OpenSubtitles frequency list);
 *   - the canonical concept labels and aliases (the study vocabulary: a subtitle corpus has
 *     never heard of 函数 or 一元二次方程, and those are exactly the words this app's users
 *     type at it).
 * Usage: node scripts/build-chinese-words.mjs
 */
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const PACK_PATH = "apps/desktop/src/assets/language-packs/zh-en.json";
const CANONICAL_PATH = "apps/desktop/src/data/generated/canonicalConcepts.ts";
const OUT_PATH = "packages/core-text/src/chineseWords.json";

/** Two characters or more: single characters need no dictionary to be found. */
const WORD = /^[一-鿿]{2,}$/u;

const pack = JSON.parse(readFileSync(PACK_PATH, "utf8"));
const fromPack = [...Object.keys(pack.entries), ...Object.keys(pack.forms)];

const canonicalSource = readFileSync(CANONICAL_PATH, "utf8");
const fromCanonical = [
  ...[...canonicalSource.matchAll(/label:\s*"([^"]+)"/g)].map((match) => match[1]),
  ...[...canonicalSource.matchAll(/aliases:\s*\[([^\]]*)\]/g)].flatMap((match) =>
    [...match[1].matchAll(/"([^"]+)"/g)].map((alias) => alias[1]),
  ),
];

const words = [...new Set([...fromPack, ...fromCanonical])]
  .filter((word) => WORD.test(word))
  .sort();
writeFileSync(OUT_PATH, JSON.stringify(words));
const bytes = statSync(OUT_PATH).size;
console.log(
  `${words.length} words (${fromPack.filter((w) => WORD.test(w)).length} from the language pack, ` +
    `${fromCanonical.filter((w) => WORD.test(w)).length} from canonical concepts) — ` +
    `${(bytes / 1024).toFixed(0)} KB, ${(gzipSync(readFileSync(OUT_PATH)).length / 1024).toFixed(0)} KB gzipped`,
);
