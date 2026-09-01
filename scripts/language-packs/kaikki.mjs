/**
 * Purpose: streaming reader for Kaikki's machine-readable Wiktionary extracts, the one
 * upstream that covers hundreds of languages with the same record shape — one JSON object
 * per line, each a dictionary entry with senses, glosses, inflected forms and IPA.
 * The files run to tens or hundreds of megabytes, so they are read line by line and never
 * held in memory whole.
 * Main exports: kaikkiUrlFor, streamKaikkiEntries, downloadCachedStream.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { Readable } from "node:stream";

/** Kaikki publishes one extract per language, named after the language's English name. */
export function kaikkiUrlFor(languageName) {
  const slug = languageName.replaceAll(" ", "%20");
  return `https://kaikki.org/dictionary/${slug}/kaikki.org-dictionary-${slug}.jsonl`;
}

/** Downloads `url` to `cacheDir/filename` if it is not there yet, streaming to disk so a
 * 200 MB extract never lands in memory. Returns the local path. */
export async function downloadCachedStream(url, cacheDir, filename) {
  const dest = path.join(cacheDir, filename);
  if (fs.existsSync(dest)) {
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
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(partial);
    Readable.fromWeb(response.body).pipe(out).on("finish", resolve).on("error", reject);
  });
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
