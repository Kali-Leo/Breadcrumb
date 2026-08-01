/**
 * Purpose: recomputes the same mastery/interest/frontier snapshot apps/desktop's
 * plannerStore.recompute() does, headlessly, from a journey's own repos at a given instant.
 * Shared by the follow-frontier journey action and the per-day state digest.
 * Main exports: computePlannerSnapshot, PlannerSnapshot.
 */
import type { KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import {
  aggregateInterest,
  DEFAULT_SPREAD_FACTOR,
  spreadInterest,
} from "@breadcrumb/plugin-interest";
import { computeMastery, LIT_THRESHOLD } from "@breadcrumb/plugin-memory";
import { type FrontierCandidate, frontier } from "@breadcrumb/plugin-planner";
import type { SimlabRepos } from "../db/repos";

export interface PlannerSnapshot {
  nodes: KnowledgeNodeRow[];
  edges: KnowledgeEdgeRow[];
  masteryByNode: Map<string, number>;
  interestByNode: Map<string, number>;
  frontierCandidates: FrontierCandidate[];
}

export async function computePlannerSnapshot(
  repos: SimlabRepos,
  nowIso: string,
): Promise<PlannerSnapshot> {
  const [nodes, edges, sightings, claims, signals, embeddings] = await Promise.all([
    repos.knowledgeNodes.listAll(),
    repos.knowledgeEdges.listAll(),
    repos.nodeSightings.listAll(),
    repos.masteryClaims.listAll(),
    repos.interestSignals.listAll(),
    repos.nodeEmbeddings.listAll(),
  ]);

  const masteryByNode = computeMastery(sightings, claims, nowIso);
  const interestScoresByNode = aggregateInterest(signals, nowIso);
  const curiosityByNode = new Map(
    [...interestScoresByNode].map(([nodeId, score]) => [nodeId, score.curiosity]),
  );
  const interestByNode = spreadInterest(curiosityByNode, embeddings, DEFAULT_SPREAD_FACTOR);

  const frontierCandidates = frontier({
    nodes,
    edges,
    masteryByNode,
    interestByNode,
    litThreshold: LIT_THRESHOLD,
  });

  return { nodes, edges, masteryByNode, interestByNode, frontierCandidates };
}
