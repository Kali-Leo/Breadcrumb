#!/usr/bin/env node
/**
 * Purpose: keep the browser edition's first screen small. It was 6.9 MB in one entry chunk
 * (1.73 MiB gzipped) once, because nothing was watching; this watches. Runs as apps/web's
 * `postbuild`, so every `pnpm build` in that package checks itself.
 *
 * Two numbers, both gzipped, because gzip is what GitHub Pages actually serves (measured
 * 2026-09-02: it does not send brotli for this site's assets):
 *
 *   1. the entry chunk on its own — the file the html tag points at;
 *   2. the whole critical path — that chunk plus every chunk and stylesheet the browser is
 *      told to fetch before the first paint, which is exactly the `modulepreload` and
 *      `stylesheet` links Vite writes into index.html.
 *
 * The second is the one that matters to a learner on a slow connection; the first stops the
 * critical path from being "kept small" by shovelling the same bytes into a sibling chunk.
 *
 * Not counted, and deliberately so — none of it is fetched before the first paint:
 *   the ESCO/O*NET occupation datasets, the language packs, the font slices, the SQLite wasm
 *   and its worker, and every view's own chunk (palace/Pixi, trends/Recharts, chat/KaTeX).
 * To exempt something else, it has to stop being referenced from index.html — that is the
 * only way it stops being on the critical path, and this file has no allowlist on purpose.
 *
 * Zero dependencies, Node 24.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

/** The entry chunk alone. */
const ENTRY_GZIP_LIMIT = 600 * 1024;
/** Entry plus everything index.html asks for up front. Headroom over today's number is
 * deliberate — this is a ratchet against regressions, not a target to grow into. */
const CRITICAL_PATH_GZIP_LIMIT = 800 * 1024;

const distDir = resolve(
  process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "web", "dist"),
);

function readIndexHtml() {
  try {
    return readFileSync(join(distDir, "index.html"), "utf8");
  } catch {
    console.error(`no build to check: ${join(distDir, "index.html")} is not there.`);
    process.exit(1);
  }
}

/** Vite writes the base path into every href, and the base is a deploy-time setting, so the
 * files are found by name under dist rather than by resolving the url. */
function fileByName(name) {
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = walk(full);
        if (found !== null) return found;
      } else if (entry.name === name) return full;
    }
    return null;
  };
  return walk(distDir);
}

function gzipOf(path) {
  return gzipSync(readFileSync(path), { level: 9 }).length;
}

const html = readIndexHtml();
const entryHref = /<script[^>]+type="module"[^>]+src="([^"]+)"/.exec(html)?.[1];
if (entryHref === undefined) {
  console.error("index.html has no module script — the build did not produce an entry chunk.");
  process.exit(1);
}

const criticalHrefs = [
  entryHref,
  ...[...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map((m) => m[1]),
  ...[...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1]),
];

const rows = criticalHrefs.map((href) => {
  const name = href.split("/").pop();
  const path = fileByName(name);
  if (path === null) {
    console.error(`index.html references ${name}, which is not in ${distDir}.`);
    process.exit(1);
  }
  return { name, raw: statSync(path).size, gzip: gzipOf(path) };
});

const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
const entry = rows[0];
const total = rows.reduce((sum, row) => sum + row.gzip, 0);

console.log("first screen (gzipped, as GitHub Pages serves it):");
for (const row of rows) console.log(`  ${kib(row.gzip).padStart(10)}  ${row.name}`);
console.log(`  ${kib(total).padStart(10)}  total`);

const failures = [];
if (entry.gzip > ENTRY_GZIP_LIMIT)
  failures.push(`entry chunk ${kib(entry.gzip)} over the ${kib(ENTRY_GZIP_LIMIT)} ceiling`);
if (total > CRITICAL_PATH_GZIP_LIMIT)
  failures.push(`critical path ${kib(total)} over the ${kib(CRITICAL_PATH_GZIP_LIMIT)} ceiling`);

if (failures.length > 0) {
  for (const failure of failures) console.error(`bundle size: ${failure}`);
  console.error(
    "Something new is being loaded before the first paint. Split it behind React.lazy or a " +
      "dynamic import rather than raising the ceiling.",
  );
  process.exit(1);
}

console.log(
  `bundle size: entry ${kib(entry.gzip)} / ${kib(ENTRY_GZIP_LIMIT)}, ` +
    `first screen ${kib(total)} / ${kib(CRITICAL_PATH_GZIP_LIMIT)}.`,
);
