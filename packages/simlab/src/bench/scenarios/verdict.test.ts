/**
 * Purpose: guards what the verdict scenarios promise the report — that each one really runs
 * the product's judge prompt over the gold evidence, and that the scoring reads the way the
 * report's column headings claim. The metric worth a test of its own is `falseSupportRate`:
 * it must be emitted only where a false support is possible (gold ≠ supported) and must be 1
 * exactly when the judge said "supported" there.
 */
import { describe, expect, it } from "vitest";
import { loadGoldVerdicts } from "../../judges/goldVerdicts";
import type { JsonBenchScenario } from "../scenarioTypes";
import { VERDICT_PURPOSE, VERDICT_VARIANTS, verdictScenarios, verdictTruths } from "./verdict";

const gold = loadGoldVerdicts();
const allScenarios = verdictScenarios().filter(
  (scenario): scenario is JsonBenchScenario => scenario.kind === "json",
);
/** The baseline configuration — the shipped quote-free prompt every other row is read against.
 * The gate is off here, so a reply's own label is the label that gets scored. */
const scenarios = allScenarios.filter((scenario) => scenario.purpose === VERDICT_PURPOSE);

function scenarioFor(itemId: string): JsonBenchScenario {
  const scenario = scenarios.find((entry) => entry.id.endsWith(`/${itemId}`));
  if (scenario === undefined) throw new Error(`no scenario for ${itemId}`);
  return scenario;
}

function reply(relationship: string, supportingEvidence: number[] = [], quote = "") {
  return { reasoning: "x", relationship, quote, supportingEvidence };
}

/** A verbatim slice of one passage the scenario really showed — what the gate demands. */
function groundedQuote(scenario: JsonBenchScenario, index = 0): string {
  const truth = verdictTruths().get(scenario.id);
  if (truth === undefined) throw new Error(`no truth for ${scenario.id}`);
  const snippet = truth.evidence[index]?.snippet ?? "";
  return snippet.replace(/\s+/g, " ").slice(0, 30);
}

describe("factcheck-verdict scenarios", () => {
  it("makes one scenario per gold item per configuration", () => {
    expect(scenarios.length).toBe(gold.items.length);
    expect(allScenarios.length).toBe(gold.items.length * VERDICT_VARIANTS.length);
    for (const scenario of scenarios) expect(scenario.purpose).toBe(VERDICT_PURPOSE);
    expect(new Set(allScenarios.map((s) => s.id)).size).toBe(allScenarios.length);
  });

  it("asks for the quote only in the quote configurations", () => {
    for (const variant of VERDICT_VARIANTS) {
      const scenario = allScenarios.find((entry) => entry.purpose === variant.purpose);
      const system = scenario?.messages[0]?.content ?? "";
      expect(system.includes("quote"), variant.purpose).toBe(variant.quote);
    }
  });

  it("pads the wide configurations with same-language distractors and keeps the decisive one", () => {
    const truths = verdictTruths();
    const item = gold.items.find((entry) => entry.decisive !== null && entry.lang === "zh-CN");
    if (item === undefined) throw new Error("gold set too thin");
    const narrow = truths.get(`factcheck-verdict-quote/${item.lang}/${item.id}`);
    const wide = truths.get(`factcheck-verdict-quote6/${item.lang}/${item.id}`);
    expect(narrow?.evidence.length).toBe(item.evidence.length);
    expect(wide?.evidence.length).toBe(6);
    // Padding may not drop or hide the passage the label rests on.
    expect(wide?.decisiveIndex).not.toBeNull();
    for (const entry of wide?.evidence ?? []) expect(entry.snippet.length).toBeGreaterThan(0);
    expect(new Set((wide?.evidence ?? []).map((entry) => entry.url)).size).toBe(6);
  });

  it("scores a quote configuration on the gated label, not the model's own", () => {
    const supported = gold.items.find((entry) => entry.label === "supported");
    if (supported === undefined) throw new Error("no supported item");
    const scenario = allScenarios.find(
      (entry) => entry.id === `factcheck-verdict-quote/${supported.lang}/${supported.id}`,
    );
    if (scenario === undefined) throw new Error("no quote scenario");
    const fabricated = scenario.check(reply("supported", [1], "资料显示这条完全正确无误"));
    // The model said supported; the gate found no such sentence, so the row scores as an
    // abstention — and the raw columns keep what the model itself claimed.
    expect(fabricated.verdictAccuracy).toBe(0);
    expect(fabricated.abstentionRate).toBe(1);
    expect(fabricated.gateDowngrade).toBe(1);
    expect(fabricated.rawVerdictAccuracy).toBe(1);
    const grounded = scenario.check(reply("supported", [1], groundedQuote(scenario)));
    expect(grounded.verdictAccuracy).toBe(1);
    expect(grounded.quoteGrounded).toBe(1);
    expect(grounded.gateDowngrade).toBe(0);
  });

  it("counts a false support against a quote configuration only after the gate", () => {
    const trap = gold.items.find((entry) => entry.label !== "supported" && entry.hard);
    if (trap === undefined) throw new Error("gold set too thin");
    const scenario = allScenarios.find(
      (entry) => entry.id === `factcheck-verdict-quote/${trap.lang}/${trap.id}`,
    );
    if (scenario === undefined) throw new Error("no quote scenario");
    const fabricated = scenario.check(reply("supported", [1], "资料显示这条完全正确无误"));
    expect(fabricated.falseSupportRate).toBe(0);
    expect(fabricated.rawFalseSupportRate).toBe(1);
  });

  it("puts the claim and every evidence passage into the real prompt", () => {
    const item = gold.items[0];
    if (item === undefined) throw new Error("empty gold set");
    const prompt = scenarioFor(item.id)
      .messages.map((m) => m.content)
      .join("\n");
    expect(prompt).toContain(item.claim);
    for (const id of item.evidence) {
      const text = gold.sourceById.get(id)?.text ?? "";
      // sanitizeEvidenceText folds whitespace, so compare on a fragment rather than the whole.
      expect(prompt).toContain(text.slice(0, 40));
    }
  });

  it("scores a correct verdict as accurate and a wrong one as not", () => {
    const supported = gold.items.find((item) => item.label === "supported");
    if (supported === undefined) throw new Error("no supported item");
    const scenario = scenarioFor(supported.id);
    expect(scenario.check(reply("supported")).verdictAccuracy).toBe(1);
    expect(scenario.check(reply("contradicted")).verdictAccuracy).toBe(0);
  });

  it("counts a false support only where the gold answer is not supported", () => {
    const trap = gold.items.find((item) => item.label !== "supported" && item.hard);
    const positive = gold.items.find((item) => item.label === "supported");
    if (trap === undefined || positive === undefined) throw new Error("gold set too thin");
    const trapScores = scenarioFor(trap.id).check(reply("supported"));
    expect(trapScores.falseSupportRate).toBe(1);
    expect(trapScores.hardFalseSupportRate).toBe(1);
    expect(scenarioFor(trap.id).check(reply("insufficient")).falseSupportRate).toBe(0);
    // A correct "supported" is not a false support, so the metric must stay absent here —
    // reporting a 0 would dilute the rate with items that could never contribute to it.
    expect(scenarioFor(positive.id).check(reply("supported"))).not.toHaveProperty(
      "falseSupportRate",
    );
  });

  it("separates abstaining from abstaining correctly", () => {
    const abstain = gold.items.find((item) => item.label === "insufficient");
    const decided = gold.items.find((item) => item.label === "contradicted");
    if (abstain === undefined || decided === undefined) throw new Error("gold set too thin");
    const right = scenarioFor(abstain.id).check(reply("insufficient"));
    expect(right.abstentionRate).toBe(1);
    expect(right.abstentionPrecision).toBe(1);
    expect(right.abstentionRecall).toBe(1);
    const dodge = scenarioFor(decided.id).check(reply("insufficient"));
    expect(dodge.abstentionRate).toBe(1);
    // Abstaining where the evidence did settle it is evasion, and precision says so.
    expect(dodge.abstentionPrecision).toBe(0);
    expect(dodge.contradictionRecall).toBe(0);
  });

  it("asks for the decisive citation only when the verdict was right", () => {
    const item = gold.items.find((entry) => entry.label === "supported");
    if (item === undefined) throw new Error("no supported item");
    const scenario = scenarioFor(item.id);
    const indices = item.evidence.map((_id, index) => index + 1);
    // One of the slots is the decisive passage; citing all of them always includes it.
    expect(scenario.check(reply("supported", indices)).citedDecisive).toBe(1);
    expect(scenario.check(reply("supported", [])).citedDecisive).toBe(0);
    expect(scenario.check(reply("contradicted", indices))).not.toHaveProperty("citedDecisive");
  });

  it("agrees with a reference model only on the same verdict", () => {
    const scenario = scenarios[0];
    if (scenario === undefined) throw new Error("no scenarios");
    expect(scenario.agree(reply("supported"), reply("supported"))).toBe(1);
    expect(scenario.agree(reply("supported"), reply("insufficient"))).toBe(0);
  });

  it("reports the price of caution as well as its benefit", () => {
    const supported = gold.items.find((entry) => entry.label === "supported");
    if (supported === undefined) throw new Error("no supported item");
    const scenario = scenarioFor(supported.id);
    expect(scenario.check(reply("supported")).supportRecall).toBe(1);
    expect(scenario.check(reply("insufficient")).supportRecall).toBe(0);
  });

  it("builds the same prompts twice", () => {
    const again = verdictScenarios();
    expect(again.map((s) => JSON.stringify(s.messages))).toEqual(
      allScenarios.map((s) => JSON.stringify(s.messages)),
    );
  });
});
