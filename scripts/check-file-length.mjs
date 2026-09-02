#!/usr/bin/env node
/**
 * Purpose: enforce the 200-line file ceiling (CLAUDE.md 工程纪律) across every tracked source
 * file, so "超了就拆" is checked by CI instead of by memory. Runs as part of `pnpm lint`.
 * Zero dependencies, Node 24.
 *
 * Exemptions — each one needs a reason, and a reason that is about the file's nature, not about
 * how much work splitting it would be:
 *   *.test.ts / *.test.tsx        — 测试装配占行：fixtures and arrange blocks are bulk, not logic.
 *   apps/desktop/src/data/generated/** — 生成物：written by a build script, never hand-edited.
 *   packages/core-i18n/src/languages.ts — 每语言一行的数据表：splitting it breaks the
 *                                   「加语言只加一行」contract that keeps i18n changes trivial.
 *   scripts/language-packs/build-pack.mjs
 *   scripts/language-packs/entry-builder.mjs — 离线管线，暂豁免，标 2026-09-02：offline pack
 *                                   pipeline, not shipped code; revisit when it is next touched.
 * No .rs file is exempt — as of 2026-09-02 the largest is 200 lines exactly.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_LINES = 200;
const TRACKED_GLOBS = ["*.ts", "*.tsx", "*.rs", "*.mjs"];

const EXEMPT_PATTERNS = [
  "**/*.test.ts",
  "**/*.test.tsx",
  "apps/desktop/src/data/generated/**",
  "packages/core-i18n/src/languages.ts",
  "scripts/language-packs/build-pack.mjs",
  "scripts/language-packs/entry-builder.mjs",
];

/** Minimal glob -> RegExp: `**` crosses directory separators, `*` does not. */
function globToRegExp(pattern) {
  const source = pattern
    .split("/")
    .map((segment) =>
      segment === "**"
        ? "(?:.+)"
        : segment.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*"),
    )
    .join("/")
    .replace(/\(\?:\.\+\)\//g, "(?:.+/)?");
  return new RegExp(`^${source}$`);
}

const exemptMatchers = EXEMPT_PATTERNS.map(globToRegExp);
const isExempt = (path) => exemptMatchers.some((matcher) => matcher.test(path));

/** Anchored on this script's own location, so the gate covers the whole repo no matter which
 * package directory `pnpm lint` happens to run it from. */
const repoRoot = execFileSync(
  "git",
  ["-C", dirname(fileURLToPath(import.meta.url)), "rev-parse", "--show-toplevel"],
  { encoding: "utf8" },
).trim();

/** wc -l semantics: a trailing newline does not open a new line. A file that git still tracks
 * but that is gone from the working tree (mid-deletion) counts as 0 and never trips the gate. */
function countLines(path) {
  let content;
  try {
    content = readFileSync(join(repoRoot, path), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return 0;
    throw error;
  }
  const lines = content.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines.length;
}

const trackedFiles = execFileSync("git", ["ls-files", "-z", "--", ...TRACKED_GLOBS], {
  cwd: repoRoot,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
})
  .split("\0")
  .filter((path) => path !== "");

const violations = trackedFiles
  .filter((path) => !isExempt(path))
  .map((path) => ({ path, lines: countLines(path) }))
  .filter(({ lines }) => lines > MAX_LINES)
  .sort((a, b) => b.lines - a.lines);

if (violations.length > 0) {
  console.error(`${violations.length} file(s) over the ${MAX_LINES}-line ceiling:`);
  for (const { path, lines } of violations)
    console.error(`  ${String(lines).padStart(5)}  ${path}`);
  console.error(
    "拆的依据是职责不是行数凑整。Split by responsibility, or add a reasoned exemption.",
  );
  process.exit(1);
}

console.log(
  `file length: ${trackedFiles.length} tracked source files, none over ${MAX_LINES} lines.`,
);
