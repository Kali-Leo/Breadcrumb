/**
 * Purpose: zustand store driving the experimental planner — recomputes frontier candidates
 * and, for a selected goal, its gap/three-route/coverage by calling the pure plugin-planner
 * functions with fresh mastery/interest data from repos. Side effect on import: subscribes
 * to knowledge:edgesUpdated, interest:updated, mastery:updated and knowledge:nodesExtracted,
 * recomputing on each — cheap and local, so dynamic replanning falls out for free.
 * Main exports: usePlannerStore.
 */
import type {
  GoalRow,
  KnowledgeEdgeRow,
  KnowledgeNodeRow,
  MasteryClaimRow,
} from "@breadcrumb/core-db";
import type { NodeInterestScore } from "@breadcrumb/plugin-interest";
import {
  aggregateInterest,
  DEFAULT_SPREAD_FACTOR,
  spreadInterest,
} from "@breadcrumb/plugin-interest";
import { computeMastery, LIT_THRESHOLD } from "@breadcrumb/plugin-memory";
import {
  type FrontierCandidate,
  frontier,
  type GapAndPathResult,
  type GoalMappingResult,
} from "@breadcrumb/plugin-planner";
import { create } from "zustand";
import { getRepos } from "../lib/db";
import { computeGapForGoal } from "../lib/plannerGapActions";
import {
  claimNodeAsLearned,
  persistCalibratedGoal,
  removeNodeFromGoal,
  requestGoalMapping,
} from "../lib/plannerGoalActions";
import { nowIso } from "../lib/time";
import { useKnowledgeStore } from "./knowledgeStore";
import { registerRecomputeSubscriptions } from "./plannerStoreEvents";
import { useSettingsStore } from "./settingsStore";

interface PlannerState {
  nodes: KnowledgeNodeRow[];
  edges: KnowledgeEdgeRow[];
  /** Kept for goal-view semantics: a 'learned' claim satisfies the goal (see plannerGapActions). */
  claims: MasteryClaimRow[];
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
   * unconfigured. Does not persist — createGoal does that immediately with the full result. */
  mapGoalText(goalText: string): Promise<GoalMappingResult | null>;
  /** Persists the full mapping result (no calibration step, see plannerGoalActions), then
   * refreshes affected stores and recomputes. */
  createGoal(title: string, mapping: GoalMappingResult): Promise<void>;
  /** "我已经会了" on one gap node — direct mastery claim, no LLM call, then recompute. */
  claimNodeLearned(nodeId: string): Promise<void>;
  /** "先跳过" on one gap node of the selected goal — removes it from that goal's node set,
   * then recompute. No-op if no goal is selected. */
  skipGoalNode(nodeId: string): Promise<void>;
}

export const usePlannerStore = create<PlannerState>((set, get) => ({
  nodes: [],
  edges: [],
  claims: [],
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
      claims,
    );

    set({
      nodes,
      edges,
      claims,
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
      state.claims,
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

  async createGoal(title, mapping) {
    const repos = await getRepos();
    const { goalId, insertedNodes } = await persistCalibratedGoal(
      repos,
      title,
      mapping,
      get().nodes,
    );
    if (insertedNodes) {
      useKnowledgeStore.setState({ nodes: await repos.knowledgeNodes.listAll() });
    }
    set({ selectedGoalId: goalId });
    await get().recompute();
  },

  async claimNodeLearned(nodeId) {
    const repos = await getRepos();
    await claimNodeAsLearned(repos, nodeId);
    await get().recompute();
  },

  async skipGoalNode(nodeId) {
    const state = get();
    const goal = state.goals.find((candidate) => candidate.id === state.selectedGoalId);
    if (goal === undefined) return;
    const repos = await getRepos();
    await removeNodeFromGoal(repos, goal, nodeId);
    await get().recompute();
  },
}));

registerRecomputeSubscriptions(() => usePlannerStore.getState().recompute());
