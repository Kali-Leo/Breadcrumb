/**
 * Purpose: mechanical copy-safety gate over every new desktop-introduced companion string
 * (spec 037 acceptance 5) — mirrors plugin-companion's own copyGate.test.ts: scans
 * COMPANION_DESKTOP_COPY and a sample chat system prompt against both the manipulation
 * lexicon and the repo's shared pressure lexicon (read directly from packages/simlab, which
 * owns it — see plugin-companion/src/copyGate.test.ts for why it's read rather than imported).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { containsManipulation } from "@breadcrumb/plugin-companion";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildCompanionChatSystemPrompt, COMPANION_DESKTOP_COPY } from "./companionActions";
import { sampleCompanionCard } from "./companionTestFixtures";

const SHARED_PRESSURE_LEXICON_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "packages",
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

describe("desktop companion copy gate", () => {
  const pressureLexicon = loadSharedPressureLexicon();
  const allCopy: string[] = [
    ...Object.values(COMPANION_DESKTOP_COPY.roleLabels),
    COMPANION_DESKTOP_COPY.chatDisabled,
    COMPANION_DESKTOP_COPY.crisisInterruptSystemLine,
    COMPANION_DESKTOP_COPY.dismiss,
    COMPANION_DESKTOP_COPY.credits,
    buildCompanionChatSystemPrompt(sampleCompanionCard(), ["示例记忆"]),
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
