/**
 * Purpose: the example learner is written in the reader's language, not in Chinese.
 *
 * The guided tour's whole argument is "here is the product doing its job" — and it was making
 * that argument with 39 Chinese concept names, four Chinese conversation titles and a Chinese
 * dialogue, whatever language the interface was set to. Someone who picked Bahasa Indonesia
 * on the first screen met a Chinese app on the second.
 *
 * The demo text lives in packages/demo-seed rather than in these catalogues (it is fixture
 * data, and the seeder runs where i18next does not), so nothing else in this folder would
 * notice a language going missing from it. This is what notices.
 */

import { UI_LANGUAGE_CODES } from "@breadcrumb/core-i18n";
import { CONCEPT_IDS, DEMO_TEXT_BY_LANGUAGE, demoTextFor } from "@breadcrumb/demo-seed";
import { describe, expect, it } from "vitest";

const HAN = /[一-鿿]/;

function allStrings(code: string): string[] {
  const text = DEMO_TEXT_BY_LANGUAGE[code];
  if (text === undefined) throw new Error(`no demo text for ${code}`);
  return [
    ...CONCEPT_IDS.flatMap((id) => [...text.concepts[id]]),
    ...Object.values(text.titles),
    text.goalTitle,
    ...text.astroMessages,
    ...text.jsMessages,
    ...text.teachMessages,
    ...text.vocabMessages,
    ...text.wordContexts,
  ];
}

describe("the example learner the tour installs", () => {
  it("exists in every language the picker offers, and in no language it does not", () => {
    expect(Object.keys(DEMO_TEXT_BY_LANGUAGE).sort()).toEqual([...UI_LANGUAGE_CODES].sort());
  });

  it.each(UI_LANGUAGE_CODES)("%s names all 39 concepts and writes every line", (code) => {
    for (const text of allStrings(code)) {
      expect(text.trim().length, `${code}: an empty string`).toBeGreaterThan(0);
    }
  });

  it.each(UI_LANGUAGE_CODES.filter((code) => code !== "zh-CN"))(
    "%s is translated, not copied from the Chinese",
    (code) => {
      for (const text of allStrings(code)) {
        expect(HAN.test(text), `${code}: Chinese left in "${text}"`).toBe(false);
      }
    },
  );

  it.each(UI_LANGUAGE_CODES)("%s keeps the word placeholder its sentences need", (code) => {
    const text = DEMO_TEXT_BY_LANGUAGE[code];
    for (const sentence of text?.wordContexts ?? []) {
      expect(sentence, `${code}: no {word} to put the word in`).toContain("{word}");
    }
  });

  it("falls back through the bare language tag, then to English", () => {
    expect(demoTextFor("pt-BR")).toBe(DEMO_TEXT_BY_LANGUAGE.pt);
    expect(demoTextFor("zh-CN")).toBe(DEMO_TEXT_BY_LANGUAGE["zh-CN"]);
    // Amharic is in the language table but has no interface and no demo text yet.
    expect(demoTextFor("am")).toBe(DEMO_TEXT_BY_LANGUAGE.en);
    expect(demoTextFor(undefined)).toBe(DEMO_TEXT_BY_LANGUAGE["zh-CN"]);
  });

  it("says the same thing in every language: same nodes, same conversations", () => {
    const shape = (code: string) => {
      const text = DEMO_TEXT_BY_LANGUAGE[code];
      return {
        concepts: Object.keys(text?.concepts ?? {}).sort(),
        astro: text?.astroMessages.length,
        js: text?.jsMessages.length,
        teach: text?.teachMessages.length,
        vocab: text?.vocabMessages.length,
        contexts: text?.wordContexts.length,
      };
    };
    for (const code of UI_LANGUAGE_CODES) {
      expect(shape(code), `${code} does not match the Chinese original's shape`).toEqual(
        shape("zh-CN"),
      );
    }
  });
});
