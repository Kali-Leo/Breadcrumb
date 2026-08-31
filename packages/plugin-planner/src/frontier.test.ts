/**
 * Purpose: unit tests for frontier() — the ever-lit requires-gate, normalized score
 * composition (interest must be able to outrank helps), concept/method bucketing, the
 * exploration slot, the explainable reason payload, and deterministic ordering.
 */
import type { KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { frontier, GOAL_GAP_SCORE_BOOST } from "./frontier";
import { propagateInterestToPrerequisites } from "./propagate";

function node(
  id: string,
  label: string,
  kind: KnowledgeNodeRow["kind"] = "concept",
): KnowledgeNodeRow {
  return {
    id,
    parent_id: null,
    label,
    summary: "",
    kind,
    created_at: "2026-08-01T00:00:00Z",
  };
}

let edgeCounter = 0;
function requires(source: string, target: string): KnowledgeEdgeRow {
  edgeCounter += 1;
  return {
    id: `e${edgeCounter}`,
    source_id: source,
    target_id: target,
    edge_type: "requires",
    weight: 1,
    confidence: 0.9,
    origin: "llm",
    created_at: "2026-08-01T00:00:00Z",
  };
}
function helps(source: string, target: string, weight: number): KnowledgeEdgeRow {
  edgeCounter += 1;
  return {
    id: `e${edgeCounter}`,
    source_id: source,
    target_id: target,
    edge_type: "helps",
    weight,
    confidence: 0.8,
    origin: "llm",
    created_at: "2026-08-01T00:00:00Z",
  };
}

const LIT = 0.85;

describe("frontier", () => {
  it("never includes a node whose requires-prerequisites are not all lit", () => {
    // A(lit) --requires--> B(unlit) --requires--> C(unlit): C's prerequisite B isn't lit.
    const nodes = [node("a", "Alpha"), node("b", "Beta"), node("c", "Charlie")];
    const edges = [requires("a", "b"), requires("b", "c")];
    const masteryByNode = new Map([
      ["a", 0.9],
      ["b", 0.3],
      ["c", 0],
    ]);
    const result = frontier({
      nodes,
      edges,
      masteryByNode,
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
    });
    expect(result.map((c) => c.nodeId)).not.toContain("c");
  });

  it("admits a node with zero requires-edges", () => {
    const nodes = [node("d", "Delta")];
    const result = frontier({
      nodes,
      edges: [],
      masteryByNode: new Map(),
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
    });
    expect(result.map((c) => c.nodeId)).toEqual(["d"]);
  });

  it("excludes an already-lit node even if it would otherwise qualify", () => {
    const nodes = [node("a", "Alpha")];
    const masteryByNode = new Map([["a", 0.9]]);
    const result = frontier({
      nodes,
      edges: [],
      masteryByNode,
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
    });
    expect(result).toEqual([]);
  });

  it("reports a structured reason naming the prerequisite and the lit helps source", () => {
    const nodes = [node("a", "Alpha"), node("b", "Beta")];
    const edges = [requires("a", "b"), helps("a", "b", 0.7)];
    const masteryByNode = new Map([
      ["a", 0.9],
      ["b", 0.3],
    ]);
    const interestByNode = new Map([["b", 0.2]]);
    const result = frontier({
      nodes,
      edges,
      masteryByNode,
      interestByNode,
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
    });

    expect(result).toHaveLength(1);
    const candidate = result[0];
    expect(candidate?.nodeId).toBe("b");
    // Every component is min-max normalized inside the candidate set, so a lone candidate has
    // nothing to be better or worse than and scores 0 on all four terms.
    expect(candidate?.score).toBe(0);
    expect(candidate?.reason.litPrerequisiteLabels).toEqual(["Alpha"]);
    expect(candidate?.reason.litHelpsSources).toEqual([{ label: "Alpha", weight: 0.7 }]);
    expect(candidate?.reason.wasLitBefore).toBe(false);
  });

  it("marks wasLitBefore true for a decayed-back-under-threshold node with prior evidence", () => {
    const nodes = [node("a", "Alpha")];
    const result = frontier({
      nodes,
      edges: [],
      masteryByNode: new Map([["a", 0.2]]),
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(["a"]),
    });
    expect(result[0]?.reason.wasLitBefore).toBe(true);
  });

  it("marks wasLitBefore false for a node with no prior sighting/claim evidence", () => {
    const nodes = [node("a", "Alpha")];
    const result = frontier({
      nodes,
      edges: [],
      masteryByNode: new Map([["a", 0.2]]),
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
    });
    expect(result[0]?.reason.wasLitBefore).toBe(false);
  });

  it("does not count a helps source that isn't lit yet", () => {
    const nodes = [node("a", "Alpha"), node("b", "Beta")];
    const edges = [helps("a", "b", 0.9)];
    const masteryByNode = new Map([
      ["a", 0.2],
      ["b", 0.1],
    ]);
    const result = frontier({
      nodes,
      edges,
      masteryByNode,
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
    });
    expect(result[0]?.reason.litHelpsSources).toEqual([]);
  });

  it("attaches gatewayTo when interestGatewayByNode names a source for the candidate", () => {
    const nodes = [node("a", "Alpha")];
    const result = frontier({
      nodes,
      edges: [],
      masteryByNode: new Map([["a", 0.2]]),
      interestByNode: new Map([["a", 0.45]]),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
      interestGatewayByNode: new Map([["a", "gateway-source-id"]]),
    });
    expect(result[0]?.reason.gatewayTo).toEqual({ label: "gateway-source-id" });
  });

  it("resolves gatewayTo's source id to its node label when the source is a known node", () => {
    const nodes = [node("a", "Alpha"), node("g", "Gamma")];
    const result = frontier({
      nodes,
      edges: [],
      masteryByNode: new Map([["a", 0.2]]),
      interestByNode: new Map([["a", 0.45]]),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
      interestGatewayByNode: new Map([["a", "g"]]),
    });
    expect(result[0]?.reason.gatewayTo).toEqual({ label: "Gamma" });
  });

  it("omits gatewayTo when no interestGatewayByNode is supplied", () => {
    const nodes = [node("a", "Alpha")];
    const result = frontier({
      nodes,
      edges: [],
      masteryByNode: new Map(),
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
    });
    expect(result[0]?.reason.gatewayTo).toBeUndefined();
  });

  it("surfaces evidenceWeight on the candidate when evidenceWeightByNode is supplied", () => {
    const nodes = [node("a", "Alpha")];
    const result = frontier({
      nodes,
      edges: [],
      masteryByNode: new Map(),
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
      evidenceWeightByNode: new Map([["a", 0.6]]),
    });
    expect(result[0]?.evidenceWeight).toBe(0.6);
  });

  it("omits evidenceWeight when no evidenceWeightByNode is supplied", () => {
    const nodes = [node("a", "Alpha")];
    const result = frontier({
      nodes,
      edges: [],
      masteryByNode: new Map(),
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
    });
    expect(result[0]?.evidenceWeight).toBeUndefined();
  });

  it("orders candidates by score desc, then label asc", () => {
    const nodes = [node("d", "Delta"), node("e", "Echo"), node("f", "Foxtrot")];
    const interestByNode = new Map([
      ["d", 0],
      ["e", 0],
      ["f", 0.5],
    ]);
    const result = frontier({
      nodes,
      edges: [],
      masteryByNode: new Map(),
      interestByNode,
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
    });
    expect(result.map((c) => c.nodeId)).toEqual(["f", "d", "e"]);
  });
});

describe("frontier ranked-mode goal-gap boost (spec 016)", () => {
  it("weights the normalized goal-gap indicator by GOAL_GAP_SCORE_BOOST and marks inGoalGap", () => {
    const nodes = [node("a", "Alpha"), node("b", "Beta")];
    const result = frontier({
      nodes,
      edges: [],
      masteryByNode: new Map(),
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
      goalGapNodeIds: new Set(["a"]),
    });
    const alpha = result.find((c) => c.nodeId === "a");
    const beta = result.find((c) => c.nodeId === "b");
    expect(alpha?.score).toBeCloseTo(GOAL_GAP_SCORE_BOOST);
    expect(alpha?.reason.inGoalGap).toBe(true);
    expect(beta?.score).toBe(0);
    expect(beta?.reason.inGoalGap).toBeUndefined();
  });

  it("leaves scoring unchanged when goalGapNodeIds is omitted (casual mode)", () => {
    const nodes = [node("a", "Alpha")];
    const result = frontier({
      nodes,
      edges: [],
      masteryByNode: new Map(),
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
    });
    expect(result[0]?.score).toBe(0);
    expect(result[0]?.reason.inGoalGap).toBeUndefined();
  });
});

describe("frontier fed by propagateInterestToPrerequisites (spec 014 acceptance scenario)", () => {
  it("surfaces a locked interested node's unlit prerequisite, with a reason naming it", () => {
    // root(lit) --requires--> P(unlit, on the frontier once root is lit) --requires-->
    // X(unlit, locked because P isn't lit yet, but highly interesting).
    const nodes = [node("root", "Root"), node("p", "Prereq"), node("x", "TargetX")];
    const edges = [requires("root", "p"), requires("p", "x")];
    const masteryByNode = new Map([
      ["root", 0.9],
      ["p", 0],
      ["x", 0],
    ]);
    const rawInterestByNode = new Map([["x", 0.8]]);

    const propagated = propagateInterestToPrerequisites(
      edges,
      rawInterestByNode,
      masteryByNode,
      LIT,
    );
    const result = frontier({
      nodes,
      edges,
      masteryByNode,
      interestByNode: propagated.interestByNode,
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
      interestGatewayByNode: propagated.gatewaySourceByNode,
    });

    expect(result.map((c) => c.nodeId)).toEqual(["p"]);
    expect(result[0]?.reason.gatewayTo).toEqual({ label: "TargetX" });
  });
});

describe("frontier scoring: interest can actually move the ranking (2026-08-28 audit)", () => {
  // Three candidates fed by one lit root through helps edges of different weight. Difficulty
  // is identical (none of them has anything downstream), so helps is the only thing separating
  // them until interest enters.
  const nodes = [node("root", "Root"), node("x", "Xray"), node("y", "Yankee"), node("z", "Zulu")];
  const edges = [helps("root", "x", 0.9), helps("root", "y", 0.6)];
  const masteryByNode = new Map([["root", 0.9]]);

  function rank(interestByNode: ReadonlyMap<string, number>): string[] {
    return frontier({
      nodes,
      edges,
      masteryByNode,
      interestByNode,
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
    }).map((candidate) => candidate.nodeId);
  }

  it("ranks by helps support when no one is interesting", () => {
    expect(rank(new Map())).toEqual(["x", "y", "z"]);
  });

  it("flips the top two when the runner-up's interest goes from 0 to 0.25", () => {
    // The acceptance test the audit asked for: same helps, same difficulty, interest alone.
    // Under the old raw-sum scoring a 0.25 interest could never overcome anything, because an
    // integer prerequisite count was the only term with real range.
    expect(rank(new Map([["y", 0.25]]))).toEqual(["y", "x", "z"]);
  });
});

describe("frontier kind bucketing: method nodes don't crowd out concepts", () => {
  it("puts every concept ahead of every method, whatever they score", () => {
    // A method node ("费曼技巧") has no prerequisites and conversation never lights it, so
    // without bucketing it parks itself at the head of the list forever.
    const nodes = [
      node("m", "Feynman", "method"),
      node("c1", "Concept One"),
      node("c2", "Concept Two"),
    ];
    const result = frontier({
      nodes,
      edges: [],
      masteryByNode: new Map(),
      interestByNode: new Map([["m", 1]]),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
    });
    expect(result.map((candidate) => candidate.nodeId)).toEqual(["c1", "c2", "m"]);
    // The method candidate still scores highest — it is bucketed, not suppressed.
    expect(result.find((candidate) => candidate.nodeId === "m")?.score).toBeGreaterThan(0);
  });

  it("still surfaces a method node when there is no concept to prefer", () => {
    const result = frontier({
      nodes: [node("m", "Feynman", "method")],
      edges: [],
      masteryByNode: new Map(),
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
    });
    expect(result.map((candidate) => candidate.nodeId)).toEqual(["m"]);
  });
});

describe("frontier exploration slot (2026-08-28 audit: deterministic, no bandit)", () => {
  const nodes = [node("a", "A"), node("b", "B"), node("c", "C"), node("d", "D")];
  const interestByNode = new Map([
    ["a", 1],
    ["b", 0.8],
    ["c", 0.6],
    ["d", 0.4],
  ]);

  function rank(evidenceWeightByNode?: ReadonlyMap<string, number>): string[] {
    return frontier({
      nodes,
      edges: [],
      masteryByNode: new Map(),
      interestByNode,
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
      ...(evidenceWeightByNode === undefined ? {} : { evidenceWeightByNode }),
    }).map((candidate) => candidate.nodeId);
  }

  it("promotes the thinnest-evidence candidate into the third slot", () => {
    // D is the least-supported guess in the pool, so it takes the exploration slot from C —
    // the top two, which the learner has actually shown interest in, are left alone.
    const evidence = new Map([
      ["a", 5],
      ["b", 4],
      ["c", 3],
      ["d", 0.2],
    ]);
    expect(rank(evidence)).toEqual(["a", "b", "d", "c"]);
  });

  it("leaves the pure score order alone when the natural third place is already thinnest", () => {
    const evidence = new Map([
      ["a", 5],
      ["b", 4],
      ["c", 0.2],
      ["d", 3],
    ]);
    expect(rank(evidence)).toEqual(["a", "b", "c", "d"]);
  });

  it("does not reserve the slot when the caller supplies no evidence weights", () => {
    expect(rank()).toEqual(["a", "b", "c", "d"]);
  });

  it("does not reserve the slot when there is nothing outside the top three", () => {
    const result = frontier({
      nodes: [node("a", "A"), node("b", "B"), node("c", "C")],
      edges: [],
      masteryByNode: new Map(),
      interestByNode,
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
      evidenceWeightByNode: new Map([
        ["a", 5],
        ["b", 4],
        ["c", 3],
      ]),
    });
    expect(result.map((candidate) => candidate.nodeId)).toEqual(["a", "b", "c"]);
  });
});

describe("frontier hard gate reads 'ever lit', not 'lit right now' (2026-08-28 audit)", () => {
  const nodes = [node("a", "Alpha"), node("b", "Beta")];
  const edges = [requires("a", "b")];

  it("admits a node whose prerequisite has decayed back under the threshold", () => {
    const result = frontier({
      nodes,
      edges,
      masteryByNode: new Map([["a", 0.4]]), // learned once, forgotten since
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(["a"]),
    });
    expect(result.map((candidate) => candidate.nodeId)).toContain("b");
  });

  it("still blocks a node whose prerequisite was never touched at all", () => {
    const result = frontier({
      nodes,
      edges,
      masteryByNode: new Map([["a", 0.4]]),
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
    });
    expect(result.map((candidate) => candidate.nodeId)).not.toContain("b");
  });

  it("keeps the candidate's OWN exclusion on current mastery, so a decayed node can return", () => {
    // The distinction that makes 重逢 possible: 'a' has history, but its mastery has decayed,
    // so it is a candidate again — the gate's leniency must not leak into the exclusion.
    const result = frontier({
      nodes,
      edges,
      masteryByNode: new Map([["a", 0.4]]),
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(["a"]),
    });
    const alpha = result.find((candidate) => candidate.nodeId === "a");
    expect(alpha).toBeDefined();
    expect(alpha?.reason.wasLitBefore).toBe(true);
  });

  it("excludes a currently-lit node even though it was also lit before", () => {
    const result = frontier({
      nodes: [node("a", "Alpha")],
      edges: [],
      masteryByNode: new Map([["a", 0.95]]),
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(["a"]),
    });
    expect(result).toEqual([]);
  });

  it("lets user weights flip the order (spec 060 §3): zeroed interest hands the lead to helps", () => {
    const nodes = [node("lit", "Lit"), node("liked", "Liked"), node("helped", "Helped")];
    const edges = [helps("lit", "helped", 1)];
    const masteryByNode = new Map([["lit", 0.9]]);
    const interestByNode = new Map([["liked", 1]]);
    const base = { nodes, edges, masteryByNode, interestByNode, litThreshold: LIT };

    const defaults = frontier({ ...base, previouslyLitNodeIds: new Set<string>() });
    // interest and helps both weigh 1 by default; each candidate tops one component.
    expect(defaults.map((candidate) => candidate.nodeId)).toContain("liked");

    const helpsOnly = frontier({
      ...base,
      previouslyLitNodeIds: new Set<string>(),
      weights: { helps: 1, interest: 0, difficulty: 0.5, goalGap: 2, browsing: 0.5 },
    });
    expect(helpsOnly[0]?.nodeId).toBe("helped");

    const interestOnly = frontier({
      ...base,
      previouslyLitNodeIds: new Set<string>(),
      weights: { helps: 0, interest: 1, difficulty: 0.5, goalGap: 2, browsing: 0.5 },
    });
    expect(interestOnly[0]?.nodeId).toBe("liked");
  });
});
