#!/usr/bin/env node
/**
 * Purpose: publishes the two browsing-collector scripts under public/userscripts/ so the
 * browser edition serves them from its own origin. A script manager installs from a URL that
 * ends in `.user.js`, and Vite's asset pipeline renames imported files with a content hash —
 * which takes that suffix off and breaks the install — so they are copied verbatim instead of
 * imported. Runs before every `dev` and `build` from apps/web/package.json.
 *
 * The scripts themselves live in apps/desktop/src/assets/userscripts, where the desktop build
 * compiles them into its own binary. Copying rather than duplicating them in the repository
 * keeps one file per script, so a fix cannot land in one edition and miss the other.
 * Zero dependencies, Node 24.
 */
import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FILES = ["bilibili-feed-mode.user.js", "youtube-feed-mode.user.js"];

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceDir = resolve(webRoot, "../desktop/src/assets/userscripts");
const targetDir = join(webRoot, "public/userscripts");
mkdirSync(targetDir, { recursive: true });

for (const file of FILES) {
  const source = join(sourceDir, file);
  const target = join(targetDir, file);
  const sourceSize = statSync(source).size;
  let published = -1;
  try {
    published = statSync(target).size;
  } catch {
    // Not published yet — the copy below is the first one.
  }
  if (published === sourceSize) continue;
  copyFileSync(source, target);
  console.log(`copied ${file} (${sourceSize} bytes)`);
}
