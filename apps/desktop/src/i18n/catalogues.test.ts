/**
 * Purpose: the guarantee that every shipped language is *complete*. A half-translated
 * interface silently falls back to Chinese mid-sentence, which is worse for the reader than
 * an interface that was never offered in their language. These tests fail the build for a
 * missing key, an extra key, an empty string, or a placeholder that changed on one side.
 */
import { UI_LANGUAGE_CODES } from "@breadcrumb/core-i18n";
import { describe, expect, it } from "vitest";
import { NAMESPACES, resources } from "./index";

type Catalogue = Record<string, unknown>;

/** "composer.placeholder" style paths for every leaf string in a catalogue. */
function leafPaths(node: Catalogue, prefix = ""): string[] {
  return Object.entries(node).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object") {
      return leafPaths(value as Catalogue, path);
    }
    return [path];
  });
}

function leafAt(node: Catalogue, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current !== null && typeof current === "object") {
      return (current as Catalogue)[key];
    }
    return undefined;
  }, node);
}

/** {{name}} placeholders — a translation that drops one renders a sentence with a hole. */
function placeholdersIn(text: string): string[] {
  return [...text.matchAll(/{{\s*([\w.]+)\s*}}/g)].map((match) => match[1] as string).sort();
}

const SOURCE_LANGUAGE = "zh-CN";
const otherLanguages = UI_LANGUAGE_CODES.filter((code) => code !== SOURCE_LANGUAGE);

describe("message catalogues", () => {
  it("ships a catalogue for every language the picker offers", () => {
    for (const code of UI_LANGUAGE_CODES) {
      expect(Object.keys(resources)).toContain(code);
    }
  });

  it.each(otherLanguages)("%s says everything Chinese says, and nothing more", (code) => {
    const target = resources[code as keyof typeof resources] as Record<string, Catalogue>;
    const source = resources[SOURCE_LANGUAGE] as Record<string, Catalogue>;
    for (const namespace of NAMESPACES) {
      const sourcePaths = leafPaths(source[namespace] ?? {}).sort();
      const targetPaths = leafPaths(target[namespace] ?? {}).sort();
      expect({ namespace, paths: targetPaths }).toEqual({ namespace, paths: sourcePaths });
    }
  });

  it.each(otherLanguages)("%s has no empty or untranslated-looking strings", (code) => {
    const target = resources[code as keyof typeof resources] as Record<string, Catalogue>;
    const source = resources[SOURCE_LANGUAGE] as Record<string, Catalogue>;
    for (const namespace of NAMESPACES) {
      for (const path of leafPaths(source[namespace] ?? {})) {
        const value = leafAt(target[namespace] ?? {}, path);
        expect(typeof value, `${code}/${namespace}:${path}`).toBe("string");
        expect(String(value).trim(), `${code}/${namespace}:${path}`).not.toBe("");
        // Chinese left inside another language's catalogue means the key was copied, not
        // translated. (Chinese is the source language, so this only runs on the others.)
        expect(String(value), `${code}/${namespace}:${path}`).not.toMatch(/[一-鿿]/);
      }
    }
  });

  it.each(otherLanguages)("%s keeps every placeholder the sentence needs", (code) => {
    const target = resources[code as keyof typeof resources] as Record<string, Catalogue>;
    const source = resources[SOURCE_LANGUAGE] as Record<string, Catalogue>;
    for (const namespace of NAMESPACES) {
      for (const path of leafPaths(source[namespace] ?? {})) {
        const sourceText = String(leafAt(source[namespace] ?? {}, path));
        const targetText = String(leafAt(target[namespace] ?? {}, path));
        expect(placeholdersIn(targetText), `${code}/${namespace}:${path}`).toEqual(
          placeholdersIn(sourceText),
        );
      }
    }
  });
});
