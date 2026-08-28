/**
 * Purpose: the pure-logic packages decide *which* sentence applies and hand back a
 * `CopyMessage` — a `{ key, params }` pair the app renders. `useCopyMessage` has to widen
 * that key to `never` to call t(), so nothing else checks it: rename a catalogue key and
 * those sentences turn into raw key text on screen while every other test stays green
 * (catalogues.test.ts compares the languages to each other, and both lose the key together).
 * This walks the packages, collects every namespaced key literal, and resolves it for real.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resources } from "./index";

const PACKAGES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "packages",
);

/** `key: "learning:door.guessCorrect"` — the namespaced form only; a bare `key: "tasks"` is
 * some other package's own identifier, not a message. */
const COPY_KEY = /\bkey:\s*"([A-Za-z][\w-]*:[\w.]+)"/g;

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      found.push(...sourceFiles(path));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      found.push(path);
    }
  }
  return found;
}

function collectCopyKeys(): Array<{ file: string; key: string }> {
  const keys: Array<{ file: string; key: string }> = [];
  for (const packageName of readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
    if (!packageName.isDirectory()) continue;
    const sourceDir = join(PACKAGES_DIR, packageName.name, "src");
    let files: string[];
    try {
      files = sourceFiles(sourceDir);
    } catch {
      continue;
    }
    for (const file of files) {
      const text = readFileSync(file, "utf-8");
      for (const match of text.matchAll(COPY_KEY)) {
        keys.push({ file, key: match[1] as string });
      }
    }
  }
  return keys;
}

function resolve(key: string): unknown {
  const [namespace, path] = key.split(":");
  const catalogue = resources["zh-CN"]?.[namespace as string];
  if (catalogue === undefined) return undefined;
  return (path as string).split(".").reduce<unknown>((current, part) => {
    if (current !== null && typeof current === "object") {
      return (current as Record<string, unknown>)[part];
    }
    return undefined;
  }, catalogue);
}

describe("CopyMessage keys the packages hand to the app", () => {
  const keys = collectCopyKeys();

  it("finds the keys at all (a regex that stops matching would pass vacuously)", () => {
    expect(keys.length).toBeGreaterThan(20);
  });

  it("resolves every one of them to a real sentence", () => {
    for (const { file, key } of keys) {
      expect(typeof resolve(key), `${key} (${file})`).toBe("string");
    }
  });
});
