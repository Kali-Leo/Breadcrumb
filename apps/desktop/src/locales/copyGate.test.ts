/**
 * Purpose: the pressure-language gate over everything the user reads. It used to run inside
 * simlab against four per-plugin copy modules; now that all wording lives in the catalogues
 * (spec 058 §2), one scan covers every string in the app — including the ones those modules
 * never held — plus the bundled research task's own display text.
 */
import { findPressureLexiconHits, loadPressureLexicon } from "@breadcrumb/simlab";
import { describe, expect, it } from "vitest";
import { resources } from "../i18n";
import { DEMO_RESEARCH_TASK_TEXT } from "../lib/researchSampleTask";

const PRAISE_WORDS = ["真棒", "太棒", "厉害", "加油", "优秀", "了不起", "真聪明"];

/** Every leaf string of the Chinese catalogues, with its path for a readable failure. */
function chineseCopyEntries(): Array<{ path: string; text: string }> {
  const entries: Array<{ path: string; text: string }> = [];
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
  walk(resources["zh-CN"], "");
  for (const [index, text] of DEMO_RESEARCH_TASK_TEXT.entries()) {
    entries.push({ path: `researchSampleTask[${index}]`, text });
  }
  return entries;
}

describe("everything the user reads", () => {
  const lexicon = loadPressureLexicon();
  const entries = chineseCopyEntries();

  it("covers the whole interface, not a sample of it", () => {
    // A catalogue that suddenly shrinks means copy escaped back into components.
    expect(entries.length).toBeGreaterThan(150);
  });

  it("hits zero pressure-lexicon entries", () => {
    for (const entry of entries) {
      expect(findPressureLexiconHits(entry.text, lexicon), entry.path).toEqual([]);
    }
  });

  it("contains no praise words (plain statements only)", () => {
    for (const entry of entries) {
      for (const praise of PRAISE_WORDS) {
        expect(entry.text, entry.path).not.toContain(praise);
      }
    }
  });
});
