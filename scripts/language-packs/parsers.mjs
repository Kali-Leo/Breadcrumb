/**
 * Purpose: cached downloads plus line-format parsers for the language-pack builder's upstream
 * sources — CC-CEDICT, FrequencyWords, and CMUdict.
 * Main exports: downloadCached, parseCedict, parseFrequencyList, parseCmudict.
 */
import fs from "node:fs";
import path from "node:path";

/** Downloads `url` into `cacheDir/filename`, skipping the network call when the file already
 * exists on disk. Returns the raw bytes either way. */
export async function downloadCached(url, cacheDir, filename) {
  const dest = path.join(cacheDir, filename);
  if (fs.existsSync(dest)) {
    console.log(`  cached: ${filename}`);
    return fs.readFileSync(dest);
  }
  console.log(`  downloading: ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(dest, buffer);
  return buffer;
}

/** Parses CC-CEDICT text into simplified → raw line list (a simplified form can have several
 * CEDICT lines, one per pronunciation/sense reading). Comment lines start with `#`. */
export function parseCedict(text) {
  const bySimplified = new Map();
  const lineRe = /^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.*)\/\s*$/;
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const match = lineRe.exec(line);
    if (!match) continue;
    const [, traditional, simplified, pinyin, glossField] = match;
    const glosses = glossField.split("/").filter((g) => g.length > 0);
    if (glosses.length === 0) continue;
    const entry = { traditional, simplified, pinyin, glosses };
    const existing = bySimplified.get(simplified);
    if (existing) existing.push(entry);
    else bySimplified.set(simplified, [entry]);
  }
  return bySimplified;
}

/** Parses a FrequencyWords `word count` file (already ordered by descending frequency) into
 * word → 1-based rank, keeping the first occurrence of each word. */
export function parseFrequencyList(text) {
  const rankByWord = new Map();
  let rank = 0;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const spaceIndex = trimmed.indexOf(" ");
    const word = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
    rank += 1;
    if (!rankByWord.has(word)) rankByWord.set(word, rank);
  }
  return rankByWord;
}

/** Parses CMUdict into lowercase word → ARPABET phoneme array, keeping only the primary
 * pronunciation (variants are suffixed `WORD(2)` in the source and are skipped). */
export function parseCmudict(text) {
  const phonemesByWord = new Map();
  for (const line of text.split("\n")) {
    if (!line || line.startsWith(";;;")) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const [rawWord, ...phonemes] = parts;
    if (rawWord.includes("(")) continue; // alternate pronunciation, skip
    const word = rawWord.toLowerCase();
    if (!phonemesByWord.has(word)) phonemesByWord.set(word, phonemes);
  }
  return phonemesByWord;
}
