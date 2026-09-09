/**
 * Purpose: unit tests for the voting analysis — the combination rules, the safety-first
 * treatment of a missing vote, and the promise the comparison table rests on: an ensemble row
 * and a single-model row are scored by the same function, so they can be read against each
 * other. Synthetic truths, because the point here is the arithmetic, not the gold set.
 */
import { describe, expect, it } from "vitest";
import type { VerdictTruth } from "./scenarios/verdictTruth";
import { ensembleRows } from "./verdictEnsemble";
import {
  dedupeCalls,
  type EnsembleConfig,
  ensembleLabel,
  panelConfigs,
  type VerdictCall,
} from "./verdictVoting";

const EVIDENCE = [
  {
    url: "https://x.test",
    title: "t",
    snippet: "光速是每秒 299792458 米。",
    source: "wikipedia",
  },
];

function truth(id: string, gold: VerdictTruth["gold"], gated = false): VerdictTruth {
  return {
    scenarioId: id,
    purpose: "p",
    itemId: id,
    language: "zh-CN",
    gold,
    hard: gold !== "supported",
    gated,
    evidence: EVIDENCE,
    decisiveIndex: gold === "insufficient" ? null : 1,
  };
}

function call(
  scenarioId: string,
  modelId: string,
  relationship: VerdictTruth["gold"] | null,
  quote = "",
): VerdictCall {
  return {
    scenarioId,
    modelId,
    reply: relationship === null ? null : { relationship, quote, supportingEvidence: [1] },
    latencyMs: 1000,
  };
}

const UNANIMOUS: EnsembleConfig = { name: "全票", modelIds: ["a", "b", "c"], rule: "unanimous" };
const MAJORITY: EnsembleConfig = { name: "多数", modelIds: ["a", "b", "c"], rule: "majority" };

describe("ensembleLabel", () => {
  it("keeps a label only when every voter agrees", () => {
    expect(ensembleLabel(["supported", "supported", "supported"], "unanimous")).toBe("supported");
    expect(ensembleLabel(["supported", "supported", "insufficient"], "unanimous")).toBe(
      "insufficient",
    );
    // Disagreement between judges IS the evidence being unclear — never a coin toss.
    expect(ensembleLabel(["supported", "contradicted"], "unanimous")).toBe("insufficient");
  });

  it("takes a label with more than half the votes under the majority rule", () => {
    expect(ensembleLabel(["supported", "supported", "contradicted"], "majority")).toBe("supported");
    // Two ways of being wrong outvoting one way of being right is still no majority.
    expect(ensembleLabel(["supported", "contradicted", "insufficient"], "majority")).toBe(
      "insufficient",
    );
    expect(ensembleLabel(["supported", "contradicted"], "majority")).toBe("insufficient");
  });

  it("abstains on no votes at all", () => {
    expect(ensembleLabel([], "unanimous")).toBe("insufficient");
  });
});

describe("panelConfigs", () => {
  it("compares every model alone, the whole panel both ways, and each pair", () => {
    const configs = panelConfigs(["a", "b", "c"]);
    expect(configs.filter((entry) => entry.rule === "single").map((entry) => entry.name)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(configs.filter((entry) => entry.modelIds.length === 3)).toHaveLength(2);
    expect(configs.filter((entry) => entry.modelIds.length === 2)).toHaveLength(3);
  });

  it("does not print a majority row for two voters, where it asks the same question", () => {
    const configs = panelConfigs(["a", "b"]);
    expect(configs.filter((entry) => entry.rule === "majority")).toHaveLength(0);
    expect(configs.filter((entry) => entry.rule === "unanimous")).toHaveLength(1);
  });

  it("leaves a single model as its own baseline row and nothing else", () => {
    expect(panelConfigs(["a"])).toEqual([{ name: "a", modelIds: ["a"], rule: "single" }]);
  });
});

describe("dedupeCalls", () => {
  it("lets a re-measured model replace its own earlier answer instead of voting twice", () => {
    const first = call("s1", "a", "supported");
    const again = call("s1", "a", "insufficient");
    expect(dedupeCalls([first, again])).toEqual([again]);
    expect(dedupeCalls([first, call("s1", "b", "supported")])).toHaveLength(2);
    expect(dedupeCalls([first, call("s2", "a", "supported")])).toHaveLength(2);
  });
});

describe("ensembleRows", () => {
  it("turns one model's false support into an abstention when the panel disagrees", () => {
    const truths = [truth("s1", "insufficient")];
    const calls = [
      call("s1", "a", "supported"),
      call("s1", "b", "insufficient"),
      call("s1", "c", "insufficient"),
    ];
    const [unanimous, majority] = ensembleRows(truths, calls, [UNANIMOUS, MAJORITY]);
    expect(unanimous?.checks.falseSupportRate).toBe(0);
    expect(majority?.checks.falseSupportRate).toBe(0);
    expect(unanimous?.callsPerClaim).toBe(3);
    // Three voters one after another cost three latencies; run together, only the slowest.
    expect(unanimous?.latencySequentialP50Ms).toBe(3000);
    expect(unanimous?.latencyParallelP50Ms).toBe(1000);
  });

  it("lets a false support through when every voter shares it", () => {
    const truths = [truth("s1", "insufficient")];
    const calls = ["a", "b", "c"].map((model) => call("s1", model, "supported"));
    const [unanimous] = ensembleRows(truths, calls, [UNANIMOUS]);
    expect(unanimous?.checks.falseSupportRate).toBe(1);
    expect(unanimous?.checks.hardFalseSupportRate).toBe(1);
  });

  it("counts one voter's failed call as an abstention rather than as agreement", () => {
    // c answered the second item, so the panel really was measured; its failure on the first
    // is one missing vote, and under unanimity that costs the whole verdict.
    const truths = [truth("s1", "supported"), truth("s2", "supported")];
    const calls = [
      call("s1", "a", "supported"),
      call("s1", "b", "supported"),
      call("s1", "c", null),
      call("s2", "a", "supported"),
      call("s2", "b", "supported"),
      call("s2", "c", "supported"),
    ];
    const [unanimous] = ensembleRows(truths, calls, [UNANIMOUS]);
    expect(unanimous?.missingVotes).toBe(1);
    // The price of that safety, and the table has to show it: one real citation lost of two.
    expect(unanimous?.checks.supportRecall).toBe(0.5);
  });

  it("votes on the gated label where the configuration gates it", () => {
    const truths = [truth("s1", "supported", true)];
    const grounded = ["a", "b", "c"].map((model) =>
      call("s1", model, "supported", "光速是每秒 299792458 米"),
    );
    expect(ensembleRows(truths, grounded, [UNANIMOUS])[0]?.checks.verdictAccuracy).toBe(1);
    const fabricated = ["a", "b", "c"].map((model) =>
      call("s1", model, "supported", "光速是每秒 30 万公里整"),
    );
    // Unanimous and every one of them ungrounded: the gate still refuses all three.
    expect(ensembleRows(truths, fabricated, [UNANIMOUS])[0]?.checks.verdictAccuracy).toBe(0);
  });

  it("prints no row for a configuration whose voter the run never reached", () => {
    // The trap this guards: a model with no data votes insufficient every time, which reads as
    // a flawless 0% false support at 100% abstention.
    const truths = [truth("s1", "supported"), truth("s2", "insufficient")];
    const calls = [call("s1", "a", "supported"), call("s2", "a", "insufficient")];
    const rows = ensembleRows(truths, calls, [
      { name: "a", modelIds: ["a"], rule: "single" },
      { name: "never-ran", modelIds: ["b"], rule: "single" },
      UNANIMOUS,
    ]);
    expect(rows.map((entry) => entry.config)).toEqual(["a"]);
  });

  it("skips a purpose the run holds no calls for", () => {
    const truths = [truth("s1", "supported"), { ...truth("s2", "supported"), purpose: "other" }];
    const rows = ensembleRows(
      truths,
      [call("s1", "a", "supported")],
      [{ name: "a", modelIds: ["a"], rule: "single" }],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.purpose).toBe("p");
  });
});
