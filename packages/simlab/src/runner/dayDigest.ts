/**
 * Purpose: compact per-virtual-day state digest (spec 013 T6) — what a reviewer reads
 * alongside the day's transcripts instead of re-deriving it themselves: node count, new
 * nodes, edge changes, top mastery movers, current frontier, goals + coverage, interest
 * aggregates. Computed from the same PlannerSnapshot the follow-frontier action uses.
 * Main exports: computeDayDigest, DayDigest.
 */

import { NodeIdsJsonSchema, parseJsonColumn } from "@breadcrumb/core-db";
import { LIT_THRESHOLD } from "@breadcrumb/plugin-memory";
import { coverage } from "@breadcrumb/plugin-planner";
import type { SimlabRepos } from "../db/repos";
import { computePlannerSnapshot } from "./plannerSnapshot";

export interface DayDigest {
  day: number;
  dateIso: string;
  nodeCount: number;
  newNodeLabelsToday: string[];
  edgesAddedToday: number;
  edgesRejectedToday: number;
  topMasteryChanges: { label: string; from: number; to: number }[];
  frontierTop5: { label: string; score: number; reason: string }[];
  goals: { title: string; coverage: number }[];
  interestAggregate: { avgCuriosity: number; avgConfusion: number; avgBoredom: number };
}

const TOP_MASTERY_CHANGE_COUNT = 10;
const FRONTIER_DIGEST_COUNT = 5;

export interface DayDigestOutcome {
  digest: DayDigest;
  /** The full (not top-10) mastery map at this instant — feed back in as next day's
   * `previousMasteryByNode` so tomorrow's digest diffs against today's real end state. */
  masteryByNode: Map<string, number>;
}

export async function computeDayDigest(
  repos: SimlabRepos,
  day: number,
  dateIso: string,
  newNodeLabelsToday: readonly string[],
  edgesAddedToday: number,
  edgesRejectedToday: number,
  previousMasteryByNode: ReadonlyMap<string, number>,
): Promise<DayDigestOutcome> {
  const snapshot = await computePlannerSnapshot(repos, dateIso);
  const labelById = new Map(snapshot.nodes.map((node) => [node.id, node.label]));

  const topMasteryChanges = [...snapshot.masteryByNode.entries()]
    .map(([nodeId, to]) => ({
      label: labelById.get(nodeId) ?? nodeId,
      from: previousMasteryByNode.get(nodeId) ?? 0,
      to,
    }))
    .filter((change) => change.from !== change.to)
    .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from))
    .slice(0, TOP_MASTERY_CHANGE_COUNT);

  const frontierTop5 = snapshot.frontierCandidates
    .slice(0, FRONTIER_DIGEST_COUNT)
    .map((candidate) => ({
      label: candidate.label,
      score: candidate.score,
      reason: describeFrontierReason(candidate.reason),
    }));

  const goalRows = await repos.goals.listAll();
  const goals = goalRows.map((goal) => ({
    title: goal.title,
    coverage: coverage(
      parseJsonColumn(NodeIdsJsonSchema, goal.node_ids_json) ?? [],
      snapshot.masteryByNode,
      LIT_THRESHOLD,
    ),
  }));

  const signals = await repos.interestSignals.listAll();
  const interestAggregate = averageSignals(signals);

  return {
    digest: {
      day,
      dateIso,
      nodeCount: snapshot.nodes.length,
      newNodeLabelsToday: [...newNodeLabelsToday],
      edgesAddedToday,
      edgesRejectedToday,
      topMasteryChanges,
      frontierTop5,
      goals,
      interestAggregate,
    },
    masteryByNode: snapshot.masteryByNode,
  };
}

function describeFrontierReason(reason: {
  litPrerequisiteLabels: string[];
  litHelpsSources: { label: string; weight: number }[];
  wasLitBefore: boolean;
  gatewayTo?: { label: string };
}): string {
  const parts: string[] = [];
  if (reason.wasLitBefore) parts.push("重逢（以前学过，最近有点生疏）");
  if (reason.litPrerequisiteLabels.length > 0)
    parts.push(`前置已点亮：${reason.litPrerequisiteLabels.join("、")}`);
  if (reason.litHelpsSources.length > 0) {
    parts.push(
      `受助于：${reason.litHelpsSources.map((source) => `${source.label}(${source.weight})`).join("、")}`,
    );
  }
  if (reason.gatewayTo) parts.push(`通往「${reason.gatewayTo.label}」`);
  return parts.length > 0 ? parts.join("；") : "无前置门槛，直接可学";
}

function averageSignals(
  signals: readonly { curiosity: number; confusion: number; boredom: number }[],
): { avgCuriosity: number; avgConfusion: number; avgBoredom: number } {
  if (signals.length === 0) return { avgCuriosity: 0, avgConfusion: 0, avgBoredom: 0 };
  const sum = signals.reduce(
    (acc, signal) => ({
      curiosity: acc.curiosity + signal.curiosity,
      confusion: acc.confusion + signal.confusion,
      boredom: acc.boredom + signal.boredom,
    }),
    { curiosity: 0, confusion: 0, boredom: 0 },
  );
  return {
    avgCuriosity: sum.curiosity / signals.length,
    avgConfusion: sum.confusion / signals.length,
    avgBoredom: sum.boredom / signals.length,
  };
}
