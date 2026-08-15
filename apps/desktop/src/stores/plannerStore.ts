/**
 * Purpose: zustand store driving the experimental planner — recomputes frontier candidates
 * and, for a selected goal, its gap/coverage/recommended route by calling
 * computePlannerSnapshot with fresh mastery/interest data from repos. Side effect on import:
 * subscribes to knowledge:edgesUpdated, interest:updated, mastery:updated and
 * knowledge:nodesExtracted, recomputing on each — cheap and local, so dynamic replanning
 * falls out for free.
 * Main exports: usePlannerStore.
 */
import type {
  GoalRow,
  KnowledgeEdgeRow,
  KnowledgeNodeRow,
  MasteryClaimRow,
} from "@breadcrumb/core-db";
import type { NodeInterestScore } from "@breadcrumb/plugin-interest";
import type {
  FrontierCandidate,
  GapAndPathResult,
  GoalMappingResult,
  RecommendedRouteStep,
} from "@breadcrumb/plugin-planner";
import { create } from "zustand";
import { getRepos } from "../lib/db";
import { recordAiFailure } from "../lib/failureLog";
import { deriveGoalView } from "../lib/plannerGapActions";
import {
  claimNodeAsLearned,
  persistCalibratedGoal,
  removeNodeFromGoal,
  requestGoalMapping,
} from "../lib/plannerGoalActions";
import { computePlannerSnapshot } from "../lib/plannerRecompute";
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
  /** Every node id with at least one real conversation footprint, ever (spec 017 §1 goal-
   * composition chip list — see plannerRecompute.ts's PlannerSnapshot doc). */
  sightedNodeIds: Set<string>;
  goals: GoalRow[];
  selectedGoalId: string | null;
  gap: GapAndPathResult | null;
  coverageFraction: number | null;
  /** The one recommended route for the selected goal (spec 017 #1), driven by
   * settingsStore's routeParams. Null when no goal is selected. */
  route: RecommendedRouteStep[] | null;
  recompute(): Promise<void>;
  selectGoal(goalId: string | null): void;
  /** Recomputes only `route` from already-loaded state against the current routeParams —
   * cheap enough to call on every slider drag, no DB round trip. */
  recomputeRoute(): void;
  /** Calls the goal-mapping LLM; returns null (and does nothing) if goalPlanning is off or
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
  sightedNodeIds: new Set(),
  goals: [],
  selectedGoalId: null,
  gap: null,
  coverageFraction: null,
  route: null,

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

    const snapshot = computePlannerSnapshot(
      nodes,
      edges,
      sightings,
      claims,
      signals,
      embeddings,
      goals,
      get().selectedGoalId,
      useSettingsStore.getState().learningMode === "ranked",
      useSettingsStore.getState().routeParams,
      nowIso(),
    );

    set({ nodes, edges, claims, goals, ...snapshot });
  },

  selectGoal(goalId) {
    const state = get();
    const goal = state.goals.find((candidate) => candidate.id === goalId) ?? null;
    const routeParams = useSettingsStore.getState().routeParams;
    const view = deriveGoalView(
      goal,
      state.nodes,
      state.edges,
      state.masteryByNode,
      state.interestByNode,
      state.claims,
      routeParams,
    );
    set({ selectedGoalId: goalId, ...view });
  },

  recomputeRoute() {
    const state = get();
    const goal = state.goals.find((candidate) => candidate.id === state.selectedGoalId) ?? null;
    const routeParams = useSettingsStore.getState().routeParams;
    const { route } = deriveGoalView(
      goal,
      state.nodes,
      state.edges,
      state.masteryByNode,
      state.interestByNode,
      state.claims,
      routeParams,
    );
    set({ route });
  },

  async mapGoalText(goalText) {
    const settings = useSettingsStore.getState();
    if (!settings.featureSwitches.goalPlanning || !settings.networkEnabled || !settings.apiConfig) {
      return null;
    }
    try {
      const existingLabels = get().nodes.map((node) => node.label);
      return await requestGoalMapping(settings.apiConfig, goalText, existingLabels);
    } catch (error) {
      console.warn("goal mapping skipped:", error);
      void recordAiFailure("goal-planning", error);
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
