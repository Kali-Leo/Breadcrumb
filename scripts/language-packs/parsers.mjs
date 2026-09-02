/**
 * Purpose: cached downloads plus line-format parsers for the language-pack builder's upstream
 * sources — CC-CEDICT, FrequencyWords, and CMUdict.
 *
 * Every download is checked against upstream.lock.json before it is allowed into `.cache/`.
 * The packs built here are shipped to learners' machines, so an upstream that quietly changes
 * (or is taken over) must stop the build rather than flow through it — see upstream.lock.json
 * for how to re-pin a source on purpose.
 * Main exports: lockedSource, requireLockedSource, downloadCached, digestOf, parseCedict,
 * parseFrequencyList, parseCmudict.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOCK = JSON.parse(fs.readFileSync(path.join(HERE, "upstream.lock.json"), "utf-8"));

/** The pinned digest and size for `url`, or null when this upstream has never been pinned. */
export function lockedSource(url) {
  return LOCK.sources[url] ?? null;
}

/** Same, but refuses to continue: an unpinned upstream is a hole in the supply chain, not a
 * missing convenience. The message says exactly what to do about it. */
export function requireLockedSource(url) {
  const source = lockedSource(url);
  if (source === null) {
    throw new Error(
      `no pin for ${url}\n` +
        `  Download it once, run \`sha256sum\` and \`stat -c %s\` on the file, then add both\n` +
        `  under "sources" in scripts/language-packs/upstream.lock.json.`,
    );
  }
  return source;
}

export function digestOf(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function assertDigest(url, actual, expectedSha256) {
  if (actual === expectedSha256) return;
  throw new Error(
    `checksum mismatch for ${url}\n  expected ${expectedSha256}\n  got      ${actual}\n` +
      `  Either the upstream moved (re-pin it in upstream.lock.json after checking what changed)\n` +
      `  or the file was tampered with. Nothing was written to the cache.`,
  );
}

/** Downloads `url` into `cacheDir/filename`, skipping the network call when the file already
 * exists on disk. Both paths are verified against `expectedSha256` (required — a download with
 * no expected digest is exactly the hole this function exists to close). Returns the raw
 * bytes. */
export async function downloadCached(url, cacheDir, filename, expectedSha256) {
  if (typeof expectedSha256 !== "string" || expectedSha256.length !== 64) {
    throw new Error(`downloadCached(${url}) needs a 64-char expectedSha256`);
  }
  const dest = path.join(cacheDir, filename);
  if (fs.existsSync(dest)) {
    const cached = fs.readFileSync(dest);
    assertDigest(url, digestOf(cached), expectedSha256);
    console.log(`  cached: ${filename}`);
    return cached;
  }
  console.log(`  downloading: ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  assertDigest(url, digestOf(buffer), expectedSha256);
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
