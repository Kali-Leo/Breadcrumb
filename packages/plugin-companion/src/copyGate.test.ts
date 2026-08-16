/**
 * Purpose: mechanical safety gate over every companion-introduced user-visible string (spec 037
 * acceptance 5) — COMPANION_COPY, CRISIS_RESPONSE, BREAK_REMINDER_COPY, and every text field of
 * all three cards must scan clean against both the manipulation lexicon and the repo's shared
 * pressure lexicon. The pressure lexicon itself is owned by packages/simlab (dev-only test
 * harness that depends on product packages, never the reverse), so plugin-companion cannot take
 * a package dependency on it without inverting that edge. Per spec 037's own instruction ("if it
 * lives in an importable place use it, otherwise replicate its check pattern locally and say
 * so"), this file replicates simlab's `findPressureLexiconHits` substring-scan logic verbatim
 * and reads simlab's data/pressure-lexicon.json directly by relative path (read-only — no edit
 * to the simlab package) rather than duplicating the lexicon's contents by hand.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { loadCompanionCards } from "./cards/index";
import {
  buildStudentSystemPrompt,
  initialKnowledgeState,
  REFLECT_PROMPT,
  SCRIPT_PROMPT,
} from "./knowledgeState";
import { IMPORTANCE_PROMPT, REFLECTION_PROMPT } from "./memoryStream";
import {
  BREAK_REMINDER_COPY,
  COMPANION_COPY,
  CRISIS_RESPONSE,
  containsManipulation,
} from "./safety";

const SHARED_PRESSURE_LEXICON_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "simlab",
  "data",
  "pressure-lexicon.json",
);

function loadSharedPressureLexicon(): string[] {
  const raw = readFileSync(SHARED_PRESSURE_LEXICON_PATH, "utf-8");
  const parsed = z.object({ entries: z.array(z.string().min(1)) }).parse(JSON.parse(raw));
  return parsed.entries;
}

function findPressureLexiconHits(text: string, lexicon: readonly string[]): string[] {
  return lexicon.filter((entry) => text.includes(entry));
}

const PRAISE_WORDS = ["真棒", "太棒", "厉害", "加油", "优秀", "了不起", "真聪明"];

function cardTextFields(): string[] {
  return loadCompanionCards().flatMap((card) => [
    card.data.description,
    card.data.personality,
    card.data.scenario,
    card.data.first_mes,
    card.data.mes_example,
    card.data.creator_notes,
  ]);
}

/** Sample student system prompt with both a misconception and a gap populated, so the
 * copy gate scans every static sentence this module can produce, not just the empty-state one. */
function sampleStudentSystemPrompt(): string {
  const state = initialKnowledgeState("递归", {
    expectations: ["递归有基线条件", "递归会调用自身"],
    misconceptions: ["递归就是循环的另一种写法"],
    gaps: ["尾递归优化"],
  });
  return buildStudentSystemPrompt({ data: { name: "Shichimi", personality: "真诚好问。" } }, state);
}

describe("companion copy gates", () => {
  const pressureLexicon = loadSharedPressureLexicon();
  const allCopy: string[] = [
    COMPANION_COPY.sectionTitle,
    COMPANION_COPY.aiLabel,
    COMPANION_COPY.invitation("二分查找"),
    COMPANION_COPY.reunionInvitation("二分查找"),
    COMPANION_COPY.helperName("二分查找"),
    COMPANION_COPY.helperThanks("二分查找"),
    COMPANION_COPY.rosterEmpty,
    CRISIS_RESPONSE,
    BREAK_REMINDER_COPY,
    IMPORTANCE_PROMPT,
    REFLECTION_PROMPT,
    SCRIPT_PROMPT,
    REFLECT_PROMPT,
    sampleStudentSystemPrompt(),
    ...cardTextFields(),
  ];

  it("hits zero pressure-lexicon entries", () => {
    for (const text of allCopy) {
      expect(findPressureLexiconHits(text, pressureLexicon)).toEqual([]);
    }
  });

  it("hits zero manipulation-lexicon entries", () => {
    for (const text of allCopy) {
      expect(containsManipulation(text)).toBeNull();
    }
  });

  it("contains no praise words (plain statements only)", () => {
    for (const text of allCopy) {
      for (const praise of PRAISE_WORDS) {
        expect(text).not.toContain(praise);
      }
    }
  });
});
