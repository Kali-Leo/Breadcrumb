/**
 * Purpose: the guarantee that every shipped language is *complete*. A half-translated
 * interface silently falls back to Chinese mid-sentence, which is worse for the reader than
 * an interface that was never offered in their language. These tests fail the build for a
 * missing key, an extra key, an empty string, a placeholder that changed on one side, or a
 * plural form the language's own grammar requires and the catalogue never wrote.
 */
import { UI_LANGUAGE_CODES } from "@breadcrumb/core-i18n";
import { describe, expect, it } from "vitest";
import { resources } from "./allCatalogues";
import { NAMESPACES } from "./index";

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

/** The grammatical number categories this language actually distinguishes, straight from the
 * platform's CLDR data — never a hand-written table, so a language added tomorrow brings its
 * own requirements with it. */
function pluralCategoriesOf(code: string): string[] {
  try {
    return [...new Intl.PluralRules(code).resolvedOptions().pluralCategories];
  } catch {
    return ["other"];
  }
}

/** i18next expresses plurals as key suffixes (`activeDays_one`), so a target catalogue holds
 * a *family* of keys where the source holds one. Comparison happens on the family name. */
function pluralBase(path: string, categories: readonly string[]): string {
  for (const category of categories) {
    if (path.endsWith(`_${category}`)) return path.slice(0, -(category.length + 1));
  }
  return path;
}

const SOURCE_LANGUAGE = "zh-CN";
const otherLanguages = UI_LANGUAGE_CODES.filter((code) => code !== SOURCE_LANGUAGE);

function catalogueOf(code: string): Record<string, Catalogue> {
  return (resources[code] ?? {}) as Record<string, Catalogue>;
}

/** Every way this language may spell one source key: the bare key, or any plural suffix. */
function variantsOf(target: Catalogue, path: string, categories: readonly string[]): string[] {
  const spellings = [path, ...categories.map((category) => `${path}_${category}`)];
  return spellings.filter((spelling) => leafAt(target, spelling) !== undefined);
}

describe("message catalogues", () => {
  it("ships a catalogue for every language the picker offers", () => {
    for (const code of UI_LANGUAGE_CODES) {
      expect(Object.keys(resources)).toContain(code);
    }
  });

  it.each(otherLanguages)("%s says everything Chinese says, and nothing more", (code) => {
    const target = catalogueOf(code);
    const source = catalogueOf(SOURCE_LANGUAGE);
    const categories = pluralCategoriesOf(code);
    for (const namespace of NAMESPACES) {
      const sourcePaths = [...new Set(leafPaths(source[namespace] ?? {}))].sort();
      const targetPaths = [
        ...new Set(leafPaths(target[namespace] ?? {}).map((path) => pluralBase(path, categories))),
      ].sort();
      expect({ namespace, paths: targetPaths }).toEqual({ namespace, paths: sourcePaths });
    }
  });

  it.each(otherLanguages)("%s has no empty or untranslated-looking strings", (code) => {
    const target = catalogueOf(code);
    const source = catalogueOf(SOURCE_LANGUAGE);
    const categories = pluralCategoriesOf(code);
    for (const namespace of NAMESPACES) {
      for (const path of leafPaths(source[namespace] ?? {})) {
        const spellings = variantsOf(target[namespace] ?? {}, path, categories);
        expect(spellings.length, `${code}/${namespace}:${path}`).toBeGreaterThan(0);
        for (const spelling of spellings) {
          const value = leafAt(target[namespace] ?? {}, spelling);
          expect(typeof value, `${code}/${namespace}:${spelling}`).toBe("string");
          expect(String(value).trim(), `${code}/${namespace}:${spelling}`).not.toBe("");
          // Chinese left inside another language's catalogue means the key was copied, not
          // translated. (Chinese is the source language, so this only runs on the others.)
          expect(String(value), `${code}/${namespace}:${spelling}`).not.toMatch(/[一-鿿]/);
        }
      }
    }
  });

  it.each(otherLanguages)("%s keeps every placeholder the sentence needs", (code) => {
    const target = catalogueOf(code);
    const source = catalogueOf(SOURCE_LANGUAGE);
    const categories = pluralCategoriesOf(code);
    for (const namespace of NAMESPACES) {
      for (const path of leafPaths(source[namespace] ?? {})) {
        const sourceText = String(leafAt(source[namespace] ?? {}, path));
        for (const spelling of variantsOf(target[namespace] ?? {}, path, categories)) {
          const targetText = String(leafAt(target[namespace] ?? {}, spelling));
          expect(placeholdersIn(targetText), `${code}/${namespace}:${spelling}`).toEqual(
            placeholdersIn(sourceText),
          );
        }
      }
    }
  });

  // Without this, "Active on 1 days" ships and only a reader of that language ever notices.
  // Russian or Arabic would go further: a missing _few/_many falls back silently, and a
  // Chinese- or English-speaking developer cannot see it happen.
  it.each(UI_LANGUAGE_CODES)("%s writes every plural form its grammar distinguishes", (code) => {
    const target = catalogueOf(code);
    const source = catalogueOf(SOURCE_LANGUAGE);
    const categories = pluralCategoriesOf(code);
    for (const namespace of NAMESPACES) {
      for (const path of leafPaths(source[namespace] ?? {})) {
        const sourceText = String(leafAt(source[namespace] ?? {}, path));
        if (!sourceText.includes("{{count}}")) continue;
        for (const category of categories) {
          const suffixed = leafAt(target[namespace] ?? {}, `${path}_${category}`);
          // A language CLDR gives a single category to (Chinese, Japanese, Korean…) has no
          // grammatical number to get wrong, so the bare key is the whole answer for it.
          const bareIsEnough =
            categories.length === 1 && typeof leafAt(target[namespace] ?? {}, path) === "string";
          expect(
            typeof suffixed === "string" || bareIsEnough,
            `${code}/${namespace}:${path} is missing the "${category}" form`,
          ).toBe(true);
        }
      }
    }
  });
});
