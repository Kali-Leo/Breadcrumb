/**
 * Purpose: the planner store's recompute entry — loads every table computePlannerSnapshot
 * needs, reconstructs the browsing weight from the hindsight-validated trust ratio, and folds
 * the snapshot back into the store; it also owns the burst dedupe (one recompute in flight,
 * one pending rerun). Built as a factory over the store's set/get, so this module has no
 * dependency back on plannerStore.ts, which it was split out of to keep that file under the
 * file-size ceiling.
 * Main exports: createPlannerRecompute, PlannerRecomputeSliceState.
 */
import type {
  GoalRow,
  KnowledgeEdgeRow,
  KnowledgeNodeRow,
  MasteryClaimRow,
} from "@breadcrumb/core-db";
import { BROWSING_TRUST_DEFAULT } from "@breadcrumb/feature-browsing-interest";
import { useSettingsStore } from "../../stores/settingsStore";
import { loadBrowsingAffinityByNode, loadWatchedTitleRecords } from "../platform/browsingAffinity";
import { computeBrowsingTrustRatio } from "../platform/browsingTrustRatio";
import { getRepos } from "../platform/db";
import { nowIso } from "../platform/time";
import { computePlannerSnapshot, type PlannerSnapshot } from "./plannerRecompute";

/** The slice of plannerStore state a recompute reads and produces. */
export interface PlannerRecomputeSliceState extends PlannerSnapshot {
  nodes: KnowledgeNodeRow[];
  edges: KnowledgeEdgeRow[];
  claims: MasteryClaimRow[];
  goals: GoalRow[];
  recompute(): Promise<void>;
}

/** One extraction fires several bus events back-to-back; each used to launch its own
 * full-table recompute concurrently, last-write-wins. One in flight + one pending rerun
 * covers every burst. */
let recomputeInFlight = false;
let recomputePending = false;

export function createPlannerRecompute(
  set: (patch: Partial<PlannerRecomputeSliceState>) => void,
  get: () => PlannerRecomputeSliceState,
): () => Promise<void> {
  return async function recompute(): Promise<void> {
    if (recomputeInFlight) {
      recomputePending = true;
      return;
    }
    recomputeInFlight = true;
    try {
      await runRecompute();
    } finally {
      recomputeInFlight = false;
      if (recomputePending) {
        recomputePending = false;
        void get().recompute();
      }
    }

    async function runRecompute(): Promise<void> {
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

      // Best-effort (spec 059): null when the interest service or embedding model is absent,
      // and the planner then behaves exactly as it did before the bridge existed.
      const browsingAffinityByNode = await loadBrowsingAffinityByNode(embeddings);

      // One interest, one slider (spec 060 §5): the browsing weight rides the interest
      // weight at the hindsight-validated trust ratio. With no browsing data the component
      // carries no information, so the ratio is moot — skip the reconstruction.
      const userWeights = useSettingsStore.getState().recommendationWeights;
      const trustRatio =
        browsingAffinityByNode === null
          ? BROWSING_TRUST_DEFAULT
          : computeBrowsingTrustRatio(
              nodes,
              sightings,
              signals,
              embeddings,
              (await loadWatchedTitleRecords()) ?? [],
            );
      const frontierWeights = { ...userWeights, browsing: userWeights.interest * trustRatio };

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
        browsingAffinityByNode,
        frontierWeights,
      );

      set({ nodes, edges, claims, goals, ...snapshot });
    }
  };
}
