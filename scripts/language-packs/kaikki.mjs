/**
 * Purpose: streaming reader for Kaikki's machine-readable Wiktionary extracts, the one
 * upstream that covers hundreds of languages with the same record shape — one JSON object
 * per line, each a dictionary entry with senses, glosses, inflected forms and IPA.
 * The files run to tens or hundreds of megabytes, so they are read line by line and never
 * held in memory whole.
 * Main exports: kaikkiUrlFor, streamKaikkiEntries, downloadCachedStream.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { Readable } from "node:stream";

/** Kaikki publishes one extract per language, named after the language's English name. */
export function kaikkiUrlFor(languageName) {
  const slug = languageName.replaceAll(" ", "%20");
  return `https://kaikki.org/dictionary/${slug}/kaikki.org-dictionary-${slug}.jsonl`;
}

/** Streams the file at `dest` through SHA-256 without holding it in memory. */
async function digestOfFile(dest) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(dest)) hash.update(chunk);
  return hash.digest("hex");
}

/**
 * Downloads `url` to `cacheDir/filename` if it is not there yet, streaming to disk so a
 * 200 MB extract never lands in memory. Returns the local path.
 *
 * `expectedSha256` is required and checked on both paths — a cached copy is verified too, so
 * a tampered `.cache/` cannot outlive one run. `maxBytes` stops a runaway or hostile upstream
 * from filling the disk; the partial file is deleted before the error is thrown.
 */
export async function downloadCachedStream(url, cacheDir, filename, expectedSha256, maxBytes) {
  if (typeof expectedSha256 !== "string" || expectedSha256.length !== 64) {
    throw new Error(`downloadCachedStream(${url}) needs a 64-char expectedSha256`);
  }
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new Error(`downloadCachedStream(${url}) needs a positive maxBytes`);
  }
  const dest = path.join(cacheDir, filename);
  if (fs.existsSync(dest)) {
    const cachedDigest = await digestOfFile(dest);
    if (cachedDigest !== expectedSha256) {
      throw new Error(
        `checksum mismatch for cached ${filename}\n  expected ${expectedSha256}\n` +
          `  got      ${cachedDigest}\n  Delete it and rebuild, or re-pin it in upstream.lock.json.`,
      );
    }
    console.log(`  cached: ${filename}`);
    return dest;
  }
  console.log(`  downloading: ${url}`);
  const response = await fetch(url);
  if (!response.ok || response.body === null) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  fs.mkdirSync(cacheDir, { recursive: true });
  const partial = `${dest}.partial`;
  const hash = crypto.createHash("sha256");
  let written = 0;
  try {
    const out = fs.createWriteStream(partial);
    for await (const chunk of Readable.fromWeb(response.body)) {
      written += chunk.length;
      if (written > maxBytes) {
        throw new Error(`${url} exceeded the ${maxBytes}-byte ceiling from upstream.lock.json`);
      }
      hash.update(chunk);
      if (!out.write(chunk)) await new Promise((resolve) => out.once("drain", resolve));
    }
    await new Promise((resolve, reject) => out.end(resolve).on("error", reject));
    const digest = hash.digest("hex");
    if (digest !== expectedSha256) {
      throw new Error(
        `checksum mismatch for ${url}\n  expected ${expectedSha256}\n  got      ${digest}\n` +
          `  Either the extract was re-cut upstream (re-pin it in upstream.lock.json) or the\n` +
          `  download was tampered with. Nothing was written to the cache.`,
      );
    }
  } catch (error) {
    fs.rmSync(partial, { force: true });
    throw error;
  }
  fs.renameSync(partial, dest);
  return dest;
}

/** Yields one parsed entry per line; malformed lines are skipped rather than fatal (a single
 * bad record in a 500 000-line dump should not lose the pack). */
export async function* streamKaikkiEntries(filePath) {
  const input = fs.createReadStream(filePath, { encoding: "utf-8" });
  const lines = readline.createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
  for await (const line of lines) {
    if (line.length === 0) continue;
    try {
      yield JSON.parse(line);
    } catch {
      // Skip: an unparseable line is one lost word, not a lost pack.
    }
  }
}
