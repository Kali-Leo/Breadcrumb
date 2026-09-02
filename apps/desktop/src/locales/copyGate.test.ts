/**
 * Purpose: the pressure-language gate over everything the user reads. It used to run inside
 * simlab against four per-feature copy modules; now that all wording lives in the catalogues
 * (spec 058 §2), one scan covers every string in the app — including the ones those modules
 * never held — plus the bundled research task's own display text. The companion modules'
 * manipulation lexicon runs over the same set, so moving their copy here lost no gate.
 *
 * Every shipped language is scanned against its own lexicon: "reduce the pressure" is the
 * product's first principle, and a principle enforced in one language only is enforced
 * nowhere. A new language that arrives without a lexicon fails here, by design.
 */
import { UI_LANGUAGE_CODES } from "@breadcrumb/core-i18n";
import { containsManipulation } from "@breadcrumb/feature-companion";
import { findPressureLexiconHits, loadPressureLexicons } from "@breadcrumb/simlab";
import { describe, expect, it } from "vitest";
import { resources } from "../i18n";
import { DEMO_RESEARCH_TASK_TEXT } from "../lib/research/researchSampleTask";

const PRAISE_WORDS = ["真棒", "太棒", "厉害", "加油", "优秀", "了不起", "真聪明"];
const SOURCE_LANGUAGE = "zh-CN";

interface CopyEntry {
  path: string;
  text: string;
}

/** Every leaf string of one language's catalogues, with its path for a readable failure. */
function copyEntries(code: string): CopyEntry[] {
  const entries: CopyEntry[] = [];
  const walk = (node: unknown, path: string): void => {
    if (typeof node === "string") {
      entries.push({ path, text: node });
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        walk(value, path ? `${path}.${key}` : key);
      }
    }
  };
  walk(resources[code] ?? {}, "");
  // The bundled research task is Chinese material, so it rides along with that catalogue.
  if (code === SOURCE_LANGUAGE) {
    for (const [index, text] of DEMO_RESEARCH_TASK_TEXT.entries()) {
      entries.push({ path: `researchSampleTask[${index}]`, text });
    }
  }
  return entries;
}

describe("everything the user reads", () => {
  const lexicons = loadPressureLexicons();

  it("has a pressure lexicon for every language the interface is offered in", () => {
    for (const code of UI_LANGUAGE_CODES) {
      expect((lexicons[code] ?? []).length, `no pressure lexicon for ${code}`).toBeGreaterThan(0);
    }
  });

  it.each(UI_LANGUAGE_CODES)("%s covers the whole interface, not a sample of it", (code) => {
    // A catalogue that suddenly shrinks means copy escaped back into components.
    expect(copyEntries(code).length).toBeGreaterThan(150);
  });

  it.each(UI_LANGUAGE_CODES)("%s hits zero pressure-lexicon entries", (code) => {
    const lexicon = lexicons[code] ?? [];
    for (const entry of copyEntries(code)) {
      expect(findPressureLexiconHits(entry.text, lexicon), `${code}/${entry.path}`).toEqual([]);
    }
  });

  it.each(UI_LANGUAGE_CODES)("%s hits zero manipulation-lexicon entries", (code) => {
    for (const entry of copyEntries(code)) {
      expect(containsManipulation(entry.text), `${code}/${entry.path}`).toBeNull();
    }
  });

  // The praise list is Chinese only until the wording question behind it is settled; scanning
  // English against a Chinese list would only look like coverage.
  it("contains no praise words in Chinese (plain statements only)", () => {
    for (const entry of copyEntries(SOURCE_LANGUAGE)) {
      for (const praise of PRAISE_WORDS) {
        expect(entry.text, entry.path).not.toContain(praise);
      }
    }
  });
});
