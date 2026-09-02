/**
 * Purpose: the mechanical tripwire suite (spec 013 T4) — cheap always-on regression
 * assertions run against a live planner snapshot: requires-DAG acyclic, unique labels,
 * mastery/interest in [0,1], every frontier candidate's requires-prereqs really lit (hard
 * gate) with an honest reason, and goal coverage arithmetic. Independently recomputes each
 * property from raw nodes/edges/mastery instead of trusting the producing function, so a
 * regression in frontier()/coverage() itself gets caught, not just echoed back.
 * Main exports: runInvariants, Violation, InvariantInput.
 */
import type { GoalRow, KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import { NodeIdsJsonSchema, parseJsonColumn } from "@breadcrumb/core-db";
import { incomingNeighbors, topologicalOrder } from "@breadcrumb/plugin-graph";
import type { FrontierCandidate } from "@breadcrumb/plugin-planner";
import { coverage } from "@breadcrumb/plugin-planner";

export type ViolationKind =
  | "cycle"
  | "duplicate-label"
  | "mastery-out-of-range"
  | "interest-out-of-range"
  | "frontier-hard-gate"
  | "frontier-reason-mismatch"
  | "coverage-arithmetic"
  | "duplicate-goal-title"
  | "digest-reconciliation-mismatch";

export interface Violation {
  kind: ViolationKind;
  detail: string;
}

export interface InvariantInput {
  nodes: readonly KnowledgeNodeRow[];
  edges: readonly KnowledgeEdgeRow[];
  masteryByNode: ReadonlyMap<string, number>;
  interestByNode: ReadonlyMap<string, number>;
  frontierCandidates: readonly FrontierCandidate[];
  goals: readonly GoalRow[];
  litThreshold: number;
  /** The other half of frontier()'s hard gate: a prerequisite counts as satisfied if it is
   * lit now OR was ever lit. Optional so a fixture that only cares about current mastery can
   * omit it and get the stricter check. */
  previouslyLitNodeIds?: ReadonlySet<string>;
}

export function runInvariants(input: InvariantInput): Violation[] {
  return [
    ...checkAcyclic(input),
    ...checkUniqueLabels(input.nodes),
    ...checkRange("mastery-out-of-range", input.masteryByNode),
    ...checkRange("interest-out-of-range", input.interestByNode),
    ...checkFrontier(input),
    ...checkCoverage(input),
    ...checkDuplicateGoalTitles(input.goals),
  ];
}

function checkAcyclic(input: InvariantInput): Violation[] {
  try {
    topologicalOrder(
      input.edges,
      input.nodes.map((node) => node.id),
    );
    return [];
  } catch (error) {
    return [{ kind: "cycle", detail: error instanceof Error ? error.message : String(error) }];
  }
}

function checkUniqueLabels(nodes: readonly KnowledgeNodeRow[]): Violation[] {
  const seen = new Map<string, number>();
  for (const node of nodes) seen.set(node.label, (seen.get(node.label) ?? 0) + 1);
  const duplicates = [...seen.entries()].filter(([, count]) => count > 1);
  return duplicates.map(([label, count]) => ({
    kind: "duplicate-label" as const,
    detail: `label "${label}" appears ${count} times`,
  }));
}

function checkRange(
  kind: "mastery-out-of-range" | "interest-out-of-range",
  byNode: ReadonlyMap<string, number>,
): Violation[] {
  const violations: Violation[] = [];
  for (const [nodeId, value] of byNode) {
    if (value < 0 || value > 1 || Number.isNaN(value)) {
      violations.push({ kind, detail: `node ${nodeId} = ${value}` });
    }
  }
  return violations;
}

/** Independently recomputes the requires-prerequisite set and satisfaction status for each
 * frontier candidate — frontier() already only returns candidates whose prereqs have all been
 * lit at some point; this re-derives that from raw edges/mastery/history so a regression there
 * is caught, not assumed away. */
function checkFrontier(input: InvariantInput): Violation[] {
  const { edges, masteryByNode, litThreshold, frontierCandidates, nodes } = input;
  const wasEverLit = (nodeId: string) =>
    (masteryByNode.get(nodeId) ?? 0) >= litThreshold ||
    (input.previouslyLitNodeIds?.has(nodeId) ?? false);
  const labelById = new Map(nodes.map((node) => [node.id, node.label]));
  const violations: Violation[] = [];

  for (const candidate of frontierCandidates) {
    const truePrereqIds = incomingNeighbors(edges, candidate.nodeId, "requires");
    const unlit = truePrereqIds.filter((id) => !wasEverLit(id));
    if (unlit.length > 0) {
      violations.push({
        kind: "frontier-hard-gate",
        detail: `candidate "${candidate.label}" has unlit prerequisites: ${unlit.map((id) => labelById.get(id) ?? id).join("、")}`,
      });
    }
    const trueLabels = new Set(truePrereqIds.map((id) => labelById.get(id) ?? id));
    const citedLabels = new Set(candidate.reason.litPrerequisiteLabels);
    const mismatch =
      trueLabels.size !== citedLabels.size ||
      [...trueLabels].some((label) => !citedLabels.has(label));
    if (mismatch) {
      violations.push({
        kind: "frontier-reason-mismatch",
        detail: `candidate "${candidate.label}" cites [${[...citedLabels].join("、")}] but true prerequisites are [${[...trueLabels].join("、")}]`,
      });
    }
  }
  return violations;
}

/** P6 fixed goal creation to be idempotent on trimmed title; this independently re-derives
 * the same check from the live goals table so a regression in either persistCalibratedGoal
 * (desktop) or applyCreateGoal (simlab) shows up as a tripwire instead of only a unit test. */
function checkDuplicateGoalTitles(goals: readonly GoalRow[]): Violation[] {
  const countByTitle = new Map<string, number>();
  for (const goal of goals) {
    const title = goal.title.trim();
    countByTitle.set(title, (countByTitle.get(title) ?? 0) + 1);
  }
  return [...countByTitle.entries()]
    .filter(([, count]) => count > 1)
    .map(([title, count]) => ({
      kind: "duplicate-goal-title" as const,
      detail: `title "${title}" appears on ${count} goal rows`,
    }));
}

function checkCoverage(input: InvariantInput): Violation[] {
  const violations: Violation[] = [];
  for (const goal of input.goals) {
    const nodeIds = parseJsonColumn(NodeIdsJsonSchema, goal.node_ids_json) ?? [];
    const expected =
      nodeIds.length === 0
        ? 1
        : nodeIds.filter((id) => (input.masteryByNode.get(id) ?? 0) >= input.litThreshold).length /
          nodeIds.length;
    const actual = coverage(nodeIds, input.masteryByNode, input.litThreshold);
    if (Math.abs(expected - actual) > 1e-9) {
      violations.push({
        kind: "coverage-arithmetic",
        detail: `goal "${goal.title}": expected ${expected}, got ${actual}`,
      });
    }
  }
  return violations;
}
