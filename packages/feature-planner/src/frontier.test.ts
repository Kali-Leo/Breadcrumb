/**
 * Purpose: unit tests for frontier() — the unmet-prerequisite demotion that replaced the old
 * hard gate, normalized score composition (interest must be able to outrank helps),
 * concept/method bucketing, the explainable reason payload, and deterministic ordering. The
 * exploration slot moved to visibleCount.test.ts along with the slot itself.
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
  /** THE CONTRACT THAT CHANGED. There used to be a hard gate here: a node whose
   * requires-prerequisites were not all satisfied never entered the candidate list, and this
   * test asserted its absence. It is gone. The requires edges are LLM-drawn, models reproduce
   * the human prerequisite judgement on a 115-pair gold standard only 28-58% of the time, and
   * a share of the edges they do draw point the wrong way — so one reversed edge under a gate
   * deleted a concept from the learner's recommendations permanently, and invisibly to them.
   * The node is now surfaced, demoted, and made to name what is missing. */
  it("surfaces a node whose requires-prerequisite is unlit, ranked below a reachable peer", () => {
    // A(lit) --requires--> B(unlit) --requires--> C(unlit): C's prerequisite B isn't lit.
    // D is reachable and ties C on every scored component except the demotion.
    const nodes = [node("a", "Alpha"), node("b", "Beta"), node("c", "Charlie"), node("d", "Delta")];
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
    const charlie = result.find((c) => c.nodeId === "c");
    expect(charlie).toBeDefined();
    expect(charlie?.reason.unlitPrerequisiteLabels).toEqual(["Beta"]);
    expect(charlie?.reason.litPrerequisiteLabels).toEqual([]);
    // Demoted, not dropped: it sits behind the reachable candidate it would otherwise tie.
    const order = result.map((c) => c.nodeId);
    expect(order.indexOf("c")).toBeGreaterThan(order.indexOf("d"));
    expect(charlie?.score ?? 0).toBeLessThan(result.find((c) => c.nodeId === "d")?.score ?? 0);
  });

  it("costs a candidate more the more prerequisites it is missing", () => {
    // one(unlit) and two(unlit) are missing prerequisites of both; three is missing both.
    const nodes = [
      node("one", "One"),
      node("two", "Two"),
      node("blocked1", "BlockedOne"),
      node("blocked2", "BlockedTwo"),
    ];
    const edges = [
      requires("one", "blocked1"),
      requires("one", "blocked2"),
      requires("two", "blocked2"),
    ];
    const result = frontier({
      nodes,
      edges,
      masteryByNode: new Map(),
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
      // Silence difficulty so the demotion is the only thing separating the two.
      weights: { helps: 1, interest: 1, difficulty: 0, goalGap: 2, browsing: 0.5 },
    });
    const one = result.find((c) => c.nodeId === "blocked1")?.score ?? 0;
    const two = result.find((c) => c.nodeId === "blocked2")?.score ?? 0;
    expect(two).toBeLessThan(one);
    expect(one).toBeLessThan(0); // and both below the unblocked candidates at 0
  });

  it("lets a strong enough interest signal pull a blocked candidate back to the top", () => {
    // The whole point of demoting instead of gating: an edge that may well point the wrong
    // way must not be able to overrule what the learner actually asked about.
    const nodes = [node("gate", "Gate"), node("wanted", "Wanted"), node("free", "Free")];
    const edges = [requires("gate", "wanted")];
    const result = frontier({
      nodes,
      edges,
      masteryByNode: new Map(),
      interestByNode: new Map([["wanted", 0.9]]),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
    });
    expect(result[0]?.nodeId).toBe("wanted");
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
    expect(candidate?.reason.unlitPrerequisiteLabels).toEqual([]);
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

describe("frontier ranked-mode goal-gap boost", () => {
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

describe("frontier fed by propagateInterestToPrerequisites", () => {
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

    // Both are on the list now. P is the reachable step and carries the gateway reason; X is
    // the locked target itself, still shown but demoted and naming what it is missing. Which
    // of the two leads depends on how much stronger X's own interest is than the half it
    // lends P — a judgement call the learner can now make, instead of one the edge made for
    // them by hiding X.
    const byId = new Map(result.map((candidate) => [candidate.nodeId, candidate]));
    expect([...byId.keys()].sort()).toEqual(["p", "x"]);
    expect(byId.get("p")?.reason.gatewayTo).toEqual({ label: "TargetX" });
    expect(byId.get("p")?.reason.unlitPrerequisiteLabels).toEqual([]);
    expect(byId.get("x")?.reason.unlitPrerequisiteLabels).toEqual(["Prereq"]);
  });
});

describe("frontier scoring: interest can actually move the ranking", () => {
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
    // Same helps, same difficulty, interest alone.
    // Under a raw-sum scoring (no normalization) a 0.25 interest could never overcome
    // anything, because an integer prerequisite count would be the only term with real range.
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

describe("frontier keeps every bucket strictly score-descending", () => {
  const nodes = [node("a", "A"), node("b", "B"), node("c", "C"), node("d", "D")];
  const interestByNode = new Map([
    ["a", 1],
    ["b", 0.8],
    ["c", 0.6],
    ["d", 0.4],
  ]);

  function rank(evidenceWeightByNode?: ReadonlyMap<string, number>) {
    return frontier({
      nodes,
      edges: [],
      masteryByNode: new Map(),
      interestByNode,
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
      ...(evidenceWeightByNode === undefined ? {} : { evidenceWeightByNode }),
    });
  }

  /** Splicing the exploration slot in here would hand visibleFrontier a list whose scores go
   * back up in the middle — and its cliff search, which assumes descending scores, would then
   * cut the genuine 4th place while keeping a 0.000-scoring exploration pick. The slot runs
   * inside visibleFrontier, after the cut. What frontier() owes that function is a monotonic
   * list. */
  it("does not reorder for exploration, whatever the evidence weights say", () => {
    const evidence = new Map([
      ["a", 5],
      ["b", 4],
      ["c", 3],
      ["d", 0.2],
    ]);
    expect(rank(evidence).map((candidate) => candidate.nodeId)).toEqual(["a", "b", "c", "d"]);
  });

  it("emits scores that never go back up", () => {
    const scores = rank(new Map([["d", 0.2]])).map((candidate) => candidate.score);
    for (let index = 1; index < scores.length; index += 1) {
      expect(scores[index - 1] ?? 0).toBeGreaterThanOrEqual(scores[index] ?? 0);
    }
  });

  it("still carries the evidence weight through for the slot to rank on", () => {
    const evidence = new Map([["d", 0.2]]);
    expect(rank(evidence).find((candidate) => candidate.nodeId === "d")?.evidenceWeight).toBe(0.2);
  });
});

describe("frontier reads prerequisites as 'ever lit', not 'lit right now'", () => {
  const nodes = [node("a", "Alpha"), node("b", "Beta")];
  const edges = [requires("a", "b")];

  it("counts a prerequisite that has decayed back under the threshold as satisfied", () => {
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

  it("still counts a prerequisite that was never touched at all as unsatisfied", () => {
    const decayed = frontier({
      nodes,
      edges,
      masteryByNode: new Map([["a", 0.4]]),
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(["a"]),
    }).find((candidate) => candidate.nodeId === "b");
    const untouched = frontier({
      nodes,
      edges,
      masteryByNode: new Map([["a", 0.4]]),
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
    }).find((candidate) => candidate.nodeId === "b");
    // Both are candidates now; only the second one carries the demotion and the caveat.
    expect(decayed?.reason.unlitPrerequisiteLabels).toEqual([]);
    expect(untouched?.reason.unlitPrerequisiteLabels).toEqual(["Alpha"]);
    expect(untouched?.score ?? 0).toBeLessThan(decayed?.score ?? 0);
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

  it("lets user weights flip the order: zeroed interest hands the lead to helps", () => {
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

/**
 * The difficulty component is subtracted, so measuring it as the chain hanging *below* a node
 * would penalize exactly the concepts a learner should meet first: a foundation concept — the
 * thing with half the tree standing on it — would score maximum difficulty and be pushed down,
 * while an advanced node with nothing after it would score the minimum and go to the top. The
 * slider the learner pulls to get there says 先挑轻松的 / "Prefer lighter steps", so that would
 * do the opposite of what its own label promises. Difficulty is prerequisite depth instead: how
 * many courses you have to make up before this one makes sense.
 */
describe("frontier difficulty means 'how much to make up first'", () => {
  // 基础 --requires--> 中级 --requires--> 高级, and 预备(lit) --requires--> 叶子.
  // Both 基础 and 叶子 are admissible candidates; only 叶子 stands behind a prerequisite.
  // The two labels are chosen so that the tie-break order (叶子 before 基础) is the OPPOSITE
  // of the order difficulty produces — otherwise the case below could not tell them apart.
  const nodes = [
    node("foundation", "基础"),
    node("middle", "中级"),
    node("advanced", "高级"),
    node("prep", "预备"),
    node("leaf", "叶子"),
  ];
  const edges = [
    requires("foundation", "middle"),
    requires("middle", "advanced"),
    requires("prep", "leaf"),
  ];

  /** Only the two admissible-under-the-old-gate nodes: 中级 and 高级 are on the list too now
   * (blocked, demoted, at the tail), and this case is about what difficulty does to the two
   * that were always reachable. */
  function rank(difficultyWeight: number): string[] {
    return rankAll(difficultyWeight).filter((id) => id === "foundation" || id === "leaf");
  }

  function rankAll(difficultyWeight: number): string[] {
    return frontier({
      nodes,
      edges,
      masteryByNode: new Map([["prep", 1]]),
      interestByNode: new Map(),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(["prep"]),
      weights: {
        helps: 0,
        interest: 0,
        difficulty: difficultyWeight,
        goalGap: 0,
        browsing: 0,
      },
    }).map((candidate) => candidate.nodeId);
  }

  it("puts the foundation concept ahead of the node buried behind a prerequisite", () => {
    expect(rank(0.5)).toEqual(["foundation", "leaf"]);
  });

  it("is the difficulty component doing it, and the slider governs how hard", () => {
    // At weight 0 the two are indistinguishable and only the label decides (叶子 sorts before
    // 基础), so the ordering above came from the difficulty component and nothing else.
    expect(rank(0)).toEqual(["leaf", "foundation"]);
    expect(rank(2)).toEqual(["foundation", "leaf"]);
  });

  it("keeps the two nodes standing behind unlit prerequisites at the tail", () => {
    // 中级 needs 基础, 高级 needs 中级 — neither was ever lit. Both are reachable-in-principle
    // recommendations now, and both sit behind everything that is reachable today.
    expect(rankAll(0.5)).toEqual(["foundation", "leaf", "middle", "advanced"]);
  });
});

/**
 * One non-finite component would make Math.min and
 * Math.max both NaN inside normalizeAndScore, giving EVERY candidate a NaN score; the
 * comparator would then return NaN for every pair, V8 would read that as "already ordered", and
 * the whole recommendation list would come out in the order the rows happened to arrive from
 * the database. Nothing would throw and nothing would look wrong on screen.
 */
describe("frontier survives one poisoned candidate", () => {
  const nodes = [node("zeta", "Zeta"), node("alpha", "Alpha"), node("mu", "Mu")];

  function rank(interestByNode: ReadonlyMap<string, number>): string[] {
    return frontier({
      nodes,
      edges: [],
      masteryByNode: new Map(),
      interestByNode,
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
    }).map((candidate) => candidate.nodeId);
  }

  const CLEAN = new Map([
    ["zeta", 0],
    ["alpha", 0.5],
    ["mu", 1],
  ]);

  it("keeps the other candidates in their true order when one interest score is NaN", () => {
    const poisoned = new Map(CLEAN).set("zeta", Number.NaN);
    // zeta scored 0 anyway, so the honest reading of NaN as "no evidence" leaves the order
    // exactly as it was — rather than falling back to the insertion order alpha, zeta, mu.
    expect(rank(poisoned)).toEqual(rank(CLEAN));
  });

  it("never emits a NaN score", () => {
    const scores = frontier({
      nodes,
      edges: [],
      masteryByNode: new Map(),
      interestByNode: new Map(CLEAN).set("mu", Number.POSITIVE_INFINITY),
      litThreshold: LIT,
      previouslyLitNodeIds: new Set(),
    }).map((candidate) => candidate.score);
    for (const score of scores) expect(Number.isFinite(score)).toBe(true);
  });

  it("does not let an infinite component flatten everyone else's range", () => {
    const infinite = new Map(CLEAN).set("zeta", Number.POSITIVE_INFINITY);
    expect(rank(infinite)).toEqual(rank(CLEAN));
  });
});
