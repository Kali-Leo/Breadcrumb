/**
 * Purpose: the conventions a catalogue has to keep that no key-by-key comparison can see —
 * they are about how a language is written, not about which keys exist.
 *
 * Three, each from a real defect:
 *  - No sentence of ours names a physical side of our own layout. "Your conversations live
 *    on the left" was written into all eleven tours; in Arabic the rail is on the right, so
 *    the step pointed the reader away from the thing it was highlighting.
 *  - French speaks to the reader one way. Most of the catalogue says "tu"; a handful of
 *    strings had drifted into "vous", one of them switching register mid-sentence.
 *  - Bengali writes quantities in Bengali digits, which is what Intl does for `bn` too, so a
 *    hand-written "80" landed next to a formatted "৮০" on the same page.
 */
import { describe, expect, it } from "vitest";
import { resources } from "../i18n/allCatalogues";

interface Entry {
  path: string;
  text: string;
}

function entriesOf(code: string): Entry[] {
  const found: Entry[] = [];
  const walk = (node: unknown, path: string): void => {
    if (typeof node === "string") {
      found.push({ path, text: node });
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        walk(value, path ? `${path}.${key}` : key);
      }
    }
  };
  walk(resources[code] ?? {}, "");
  return found;
}

/** Words that name a physical side, per language. Only ours are forbidden — a sentence about
 * where a button sits on somebody else's website is describing their layout, not ours. */
const SIDE_WORDS: Record<string, RegExp> = {
  "zh-CN": /左边|右边|左侧|右侧|左上|右上|左下|右下/,
  en: /\b(?:on|to|at|from) the (?:left|right)\b|\b(?:left|right)-hand\b|\b(?:left|right) side\b/i,
  es: /izquierd|derech/i,
  fr: /\bà (?:gauche|droite)\b|\bde (?:gauche|droite)\b/i,
  pt: /esquerd|\bà direita\b|\bda direita\b/i,
  ru: /\bслева\b|\bсправа\b|\bлев(?:ой|ом|ая)\b|\bправ(?:ой|ом|ая)\b/i,
  ar: /اليسار|اليمين/,
  hi: /बाईं|दाईं|बायें|दायें|बाएँ|दाएँ/,
  id: /\b(?:kiri|kanan)\b/i,
  bn: /বাঁ |ডান|বাম/,
  sw: /\b(?:kushoto|kulia)\b/i,
};

/** Paths that describe another product's screen, where a side is a fact about that screen. */
const FOREIGN_SCREENS = new Set(["discovery.token"]);

const LANGUAGES = Object.keys(SIDE_WORDS);

describe("how each language is written, beyond which keys exist", () => {
  it.each(LANGUAGES)("%s never points at a side of our own layout", (code) => {
    const sideWords = SIDE_WORDS[code];
    if (sideWords === undefined) throw new Error(`no side-word pattern for ${code}`);
    for (const entry of entriesOf(code)) {
      if (FOREIGN_SCREENS.has(entry.path)) continue;
      expect(sideWords.test(entry.text), `${code}/${entry.path}: ${entry.text}`).toBe(false);
    }
  });

  it("keeps French on tutoiement throughout", () => {
    const vouvoiement = /\b(?:vous|votre|vos)\b/i;
    for (const entry of entriesOf("fr")) {
      expect(vouvoiement.test(entry.text), `fr/${entry.path}: ${entry.text}`).toBe(false);
    }
  });

  it("writes Bengali quantities in Bengali digits, the way Intl does", () => {
    // Latin digits stay where they are part of an identifier rather than a quantity: a
    // helpline you dial, a licence version, a URL path, a key you press.
    const identifiers = new Set([
      "chat.companion.credits",
      "chat.companion.crisisResponse",
      "settings.api.testResult.notFound",
      "palace.map.devDemoHint",
    ]);
    for (const entry of entriesOf("bn")) {
      if (identifiers.has(entry.path)) continue;
      const outsidePlaceholders = entry.text.replace(/\{\{[^}]*\}\}/g, "");
      expect(/[0-9]/.test(outsidePlaceholders), `bn/${entry.path}: ${entry.text}`).toBe(false);
    }
  });
});
