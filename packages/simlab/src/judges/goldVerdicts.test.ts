/**
 * Purpose: keeps the verdict gold set re-checkable by a person. The one property that makes
 * these 200 labels auditable is that every `supported` / `contradicted` item names the exact
 * sentence fragment that decides it, verbatim inside the evidence a person can open by URL —
 * so this file asserts that, rather than trusting that whoever wrote the file got it right.
 *
 * The rest are the shape rules that stop the set drifting into something a rate cannot be
 * read off: no orphan evidence, no anchor on an abstention, hard negatives only where a
 * negative is possible, and enough of every label and every language for a percentage to mean
 * something.
 */
import { describe, expect, it } from "vitest";
import { goldVerdictEvidence, loadGoldVerdicts } from "./goldVerdicts";

const gold = loadGoldVerdicts();

describe("verdict gold set", () => {
  it("holds 200 items with unique ids", () => {
    expect(gold.items.length).toBe(200);
    expect(new Set(gold.items.map((item) => item.id)).size).toBe(200);
  });

  it("anchors every decided label verbatim in its decisive passage", () => {
    for (const item of gold.items) {
      if (item.label === "insufficient") continue;
      expect(item.decisive, `${item.id} has no decisive source`).not.toBeNull();
      expect(item.anchor, `${item.id} has no anchor`).not.toBeNull();
      const source = gold.sourceById.get(item.decisive ?? "");
      expect(source, `${item.id} points at a source that is not in the file`).toBeDefined();
      // The whole audit story rests on this line: read the anchor next to the claim and the
      // label is checkable in seconds, with no model in the loop.
      expect(source?.text.includes(item.anchor ?? ""), `${item.id}: anchor not in passage`).toBe(
        true,
      );
      expect(item.evidence).toContain(item.decisive);
    }
  });

  it("leaves abstentions without an anchor to point at", () => {
    for (const item of gold.items) {
      if (item.label !== "insufficient") continue;
      expect(item.anchor, `${item.id} should have no anchor`).toBeNull();
      expect(item.decisive, `${item.id} should have no decisive source`).toBeNull();
      // Nothing to quote means the reason has to be written out instead.
      expect(item.why.length).toBeGreaterThan(10);
    }
  });

  it("marks hard negatives only where the answer is not supported", () => {
    const hard = gold.items.filter((item) => item.hard);
    for (const item of hard) expect(item.label, `${item.id}`).not.toBe("supported");
    // The difficult negatives are the point of the set, not a garnish on it.
    expect(hard.length).toBeGreaterThanOrEqual(100);
  });

  it("keeps every label frequent enough for a rate", () => {
    for (const label of ["supported", "contradicted", "insufficient"] as const) {
      const count = gold.items.filter((item) => item.label === label).length;
      expect(count, `${label} is too rare to read a rate off`).toBeGreaterThanOrEqual(50);
    }
  });

  it("covers the interface languages and every claim type", () => {
    const languages = new Set(gold.items.map((item) => item.lang));
    expect(languages.size).toBeGreaterThanOrEqual(11);
    for (const language of ["zh-CN", "en", "sw", "bn", "ar", "hi"]) {
      expect(languages, `no items in ${language}`).toContain(language);
    }
    expect(new Set(gold.items.map((item) => item.claimType)).size).toBeGreaterThanOrEqual(7);
  });

  it("writes every claim in the language of its own evidence", () => {
    for (const item of gold.items) {
      for (const id of item.evidence) {
        expect(gold.sourceById.get(id)?.lang, `${item.id} mixes languages`).toBe(item.lang);
      }
    }
  });

  it("cites only real, public, dated sources", () => {
    expect(gold.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const source of gold.sources) {
      expect(source.url.startsWith("https://"), source.id).toBe(true);
      expect(source.url).toContain("wikipedia.org/wiki/");
    }
  });

  it("hands the pipeline's own evidence shape to a caller", () => {
    const item = gold.items[0];
    expect(item).toBeDefined();
    if (item === undefined) return;
    const evidence = goldVerdictEvidence(item, gold.sourceById);
    expect(evidence.length).toBe(item.evidence.length);
    expect(evidence[0]?.snippet.length).toBeGreaterThan(40);
    expect(() => goldVerdictEvidence({ ...item, evidence: ["nope"] }, gold.sourceById)).toThrow(
      /unknown source/,
    );
  });
});
