/**
 * Purpose: zustand store driving the experimental planner — recomputes frontier candidates
 * and, for a selected goal, its gap/three-route/coverage by calling the pure plugin-planner
 * functions with fresh mastery/interest data from repos. Side effect on import: subscribes
 * to knowledge:edgesUpdated, interest:updated, mastery:updated and knowledge:nodesExtracted,
 * recomputing on each — cheap and local, so dynamic replanning falls out for free.
 * Main exports: usePlannerStore.
 */
import type { GoalRow, KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import type { NodeInterestScore } from "@breadcrumb/plugin-interest";
import {
  aggregateInterest,
  DEFAULT_SPREAD_FACTOR,
  spreadInterest,
} from "@breadcrumb/plugin-interest";
import { computeMastery, LIT_THRESHOLD } from "@breadcrumb/plugin-memory";
import {
  coverage,
  type FrontierCandidate,
  frontier,
  type GapAndPathResult,
  type GoalMappingResult,
  gapAndPath,
  type SuggestedGoalNode,
} from "@breadcrumb/plugin-planner";
import { create } from "zustand";
import { getRepos } from "../lib/db";
import { persistCalibratedGoal, requestGoalMapping } from "../lib/plannerGoalActions";
import { nowIso } from "../lib/time";
import { appEventBus } from "./chatStore";
import { useKnowledgeStore } from "./knowledgeStore";
import { useSettingsStore } from "./settingsStore";

interface PlannerState {
  nodes: KnowledgeNodeRow[];
  edges: KnowledgeEdgeRow[];
  masteryByNode: Map<string, number>;
  /** Raw per-dimension aggregate (curiosity/confusion/boredom) — the node table's columns. */
  interestScoresByNode: Map<string, NodeInterestScore>;
  /** Single-scalar, embedding-spread interest score — what frontier()/gapAndPath() consume. */
  interestByNode: Map<string, number>;
  frontierCandidates: FrontierCandidate[];
  goals: GoalRow[];
  selectedGoalId: string | null;
  gap: GapAndPathResult | null;
  coverageFraction: number | null;
  recompute(): Promise<void>;
  selectGoal(goalId: string | null): void;
  /** Calls the goal-mapping LLM; returns null (and does nothing) if labPanel is off or
   * unconfigured. Does not persist — the panel calibrates the result first. */
  mapGoalText(goalText: string): Promise<GoalMappingResult | null>;
  /** Persists a calibrated goal, then refreshes affected stores and recomputes. */
  createGoal(
    title: string,
    existingLabels: readonly string[],
    suggested: readonly SuggestedGoalNode[],
  ): Promise<void>;
}

function computeGapForGoal(
  goal: GoalRow | null,
  nodes: readonly KnowledgeNodeRow[],
  edges: readonly KnowledgeEdgeRow[],
  masteryByNode: ReadonlyMap<string, number>,
  interestByNode: ReadonlyMap<string, number>,
): { gap: GapAndPathResult | null; coverageFraction: number | null } {
  if (goal === null) return { gap: null, coverageFraction: null };
  const goalNodeIds = JSON.parse(goal.node_ids_json) as string[];
  return {
    gap: gapAndPath({
      nodes,
      edges,
      masteryByNode,
      interestByNode,
      goalNodeIds,
      litThreshold: LIT_THRESHOLD,
    }),
    coverageFraction: coverage(goalNodeIds, masteryByNode, LIT_THRESHOLD),
  };
}

export const usePlannerStore = create<PlannerState>((set, get) => ({
  nodes: [],
  edges: [],
  masteryByNode: new Map(),
  interestScoresByNode: new Map(),
  interestByNode: new Map(),
  frontierCandidates: [],
  goals: [],
  selectedGoalId: null,
  gap: null,
  coverageFraction: null,

  async recompute() {
    const repos = await getRepos();
    const [nodes, edges, sightings, claims, signals, embeddings, goals] = await Promise.all([
      repos.knowledgeNodes.listAll(),
      repos.knowledgeEdges.listAll(),
      repos.nodeSightings.listAll(),
      repos.masteryClaims.listAll(),
      repos.interestSignals.listAll(),
      repos.nodeEmbeddings.listAll(),
      repos.goals.listAll(),
    ]);

    const now = nowIso();
    const masteryByNode = computeMastery(sightings, claims, now);
    const interestScoresByNode = aggregateInterest(signals, now);
    const curiosityByNode = new Map(
      [...interestScoresByNode].map(([nodeId, score]) => [nodeId, score.curiosity]),
    );
    const interestByNode = spreadInterest(curiosityByNode, embeddings, DEFAULT_SPREAD_FACTOR);

    const previouslyLitNodeIds = new Set<string>([
      ...sightings.map((sighting) => sighting.node_id),
      ...claims.map((claim) => claim.node_id),
    ]);
    const frontierCandidates = frontier({
      nodes,
      edges,
      masteryByNode,
      interestByNode,
      litThreshold: LIT_THRESHOLD,
      previouslyLitNodeIds,
    });

    const selectedGoalId = get().selectedGoalId ?? goals[0]?.id ?? null;
    const selectedGoal = goals.find((goal) => goal.id === selectedGoalId) ?? null;
    const { gap, coverageFraction } = computeGapForGoal(
      selectedGoal,
      nodes,
      edges,
      masteryByNode,
      interestByNode,
    );

    set({
      nodes,
      edges,
      masteryByNode,
      interestScoresByNode,
      interestByNode,
      frontierCandidates,
      goals,
      selectedGoalId,
      gap,
      coverageFraction,
    });
  },

  selectGoal(goalId) {
    const state = get();
    const selectedGoal = state.goals.find((goal) => goal.id === goalId) ?? null;
    const { gap, coverageFraction } = computeGapForGoal(
      selectedGoal,
      state.nodes,
      state.edges,
      state.masteryByNode,
      state.interestByNode,
    );
    set({ selectedGoalId: goalId, gap, coverageFraction });
  },

  async mapGoalText(goalText) {
    const settings = useSettingsStore.getState();
    if (!settings.featureSwitches.labPanel || !settings.networkEnabled || !settings.apiConfig) {
      return null;
    }
    try {
      const existingLabels = get().nodes.map((node) => node.label);
      return await requestGoalMapping(settings.apiConfig, goalText, existingLabels);
    } catch (error) {
      console.warn("goal mapping skipped:", error);
      return null;
    }
  },

  async createGoal(title, existingLabels, suggested) {
    const { goalId, insertedNodes } = await persistCalibratedGoal(
      title,
      existingLabels,
      suggested,
      get().nodes,
    );
    if (insertedNodes) {
      const repos = await getRepos();
      useKnowledgeStore.setState({ nodes: await repos.knowledgeNodes.listAll() });
    }
    set({ selectedGoalId: goalId });
    await get().recompute();
  },
}));

/** Recompute is best-effort background work: a failure must warn, never surface as an
 * unhandled rejection (the app-wide dev black box would show it as a crash). */
function recomputeSafely(): void {
  usePlannerStore
    .getState()
    .recompute()
    .catch((error: unknown) => console.warn("planner recompute skipped:", error));
}

appEventBus.on("knowledge:edgesUpdated", recomputeSafely);
appEventBus.on("interest:updated", recomputeSafely);
appEventBus.on("mastery:updated", recomputeSafely);
appEventBus.on("knowledge:nodesExtracted", recomputeSafely);
