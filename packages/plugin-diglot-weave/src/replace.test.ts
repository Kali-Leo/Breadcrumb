/**
 * Purpose: tests for patch construction and the diff guard — spans must match the
 * original exactly, tampering rejects the whole set (spec 033, acceptance 1/5).
 */
import { describe, expect, it } from "vitest";
import { extractCandidates } from "./candidates";
import { applyPatches, buildPatches, verifyPatches } from "./replace";
import { scheduleReplacements } from "./scheduler";
import { makeEnFrPack } from "./testFixture";
import { countWordLikeTokens, tokenizeMessage } from "./tokenize";

const MESSAGE =
  "I want to read a very good book tonight, with some hot tea beside me, and then talk about it with everyone tomorrow morning.";

function scheduledFor(message: string) {
  const loaded = makeEnFrPack();
  const tokens = tokenizeMessage(message, "en");
  const candidates = extractCandidates(tokens, loaded);
  const scheduled = scheduleReplacements({
    candidates,
    cardsByLemma: new Map(),
    now: new Date("2026-08-12T12:00:00.000Z"),
    totalWordCount: countWordLikeTokens(tokens),
    density: 0.05,
    newWordBudgetToday: 5,
    introductionRank: new Map([
      ["book", 1],
      ["read", 2],
    ]),
  });
  return { loaded, scheduled };
}

describe("buildPatches / applyPatches", () => {
  it("produces span-accurate patches that reassemble the message", () => {
    const { loaded, scheduled } = scheduledFor(MESSAGE);
    const patches = buildPatches(MESSAGE, scheduled, loaded);
    expect(patches.length).toBeGreaterThan(0);
    expect(verifyPatches(MESSAGE, patches)).toBe(true);
    const segments = applyPatches(MESSAGE, patches);
    expect(segments).not.toBeNull();
    const reassembled = (segments ?? [])
      .map((segment) => (segment.kind === "text" ? segment.text : segment.patch.original))
      .join("");
    expect(reassembled).toBe(MESSAGE);
  });

  it("rejects a tampered patch set wholesale (diff guard)", () => {
    const { loaded, scheduled } = scheduledFor(MESSAGE);
    const patches = buildPatches(MESSAGE, scheduled, loaded);
    const tampered = patches.map((patch, index) =>
      index === 0 ? { ...patch, original: `${patch.original}x` } : patch,
    );
    expect(verifyPatches(MESSAGE, tampered)).toBe(false);
    expect(applyPatches(MESSAGE, tampered)).toBeNull();
  });

  it("rejects overlapping spans", () => {
    const patch = {
      start: 0,
      end: 3,
      original: MESSAGE.slice(0, 3),
      replacement: "x",
      lemma: "a",
      kind: "word" as const,
    };
    const overlapping = { ...patch, start: 2, end: 5, original: MESSAGE.slice(2, 5) };
    expect(verifyPatches(MESSAGE, [patch, overlapping])).toBe(false);
  });
});
