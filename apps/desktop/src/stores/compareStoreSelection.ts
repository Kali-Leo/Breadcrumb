/**
 * Purpose: the comparison tree's per-profile actions — switching profiles (saving and
 * restoring each one's expansion/detail state, computing its overlap tree, kicking off the
 * background anchor sweep), building an occupation profile offline, recording a practice
 * score, and opening a practice discussion. Split out of compareStore.ts purely to keep that
 * file under the file-size ceiling; it takes set/get as parameters, so there is no runtime
 * dependency back on the store file.
 * Main exports: createCompareSelectionActions, CompareSelectionActions,
 * CompareProfileViewState.
 */
import type { OverlapNode } from "@breadcrumb/feature-compare";
import { computeComparisonTree } from "../lib/compare/compareActions";
import { runAnchorSweep } from "../lib/compare/compareAlignActions";
import {
  createOccupationProfile,
  openPracticeConversation,
} from "../lib/compare/occupationActions";
import { getRepos } from "../lib/platform/db";
import { nowIso } from "../lib/platform/time";
import { appEventBus } from "./chatStore";
import type { CompareState } from "./compareStore";

/** Per-profile view state (VS Code explorer model): which keys are expanded and which
 * node's detail panel is open. Kept so switching profiles to peek and back doesn't lose
 * a deep expansion. */
export interface CompareProfileViewState {
  expandedKeys: ReadonlySet<string>;
  detailKey: string | null;
}

const EMPTY_PROFILE_VIEW_STATE: CompareProfileViewState = {
  expandedKeys: new Set<string>(),
  detailKey: null,
};

/** Fire-and-forget anchor sweep (spec 025 — profile-agnostic: anchors are node↔concept, so
 * one sweep serves every profile); when new pairs got judged, quietly recompute the tree so
 * semantic matches appear without the user doing anything. */
async function sweepInBackground(
  refresh: () => Promise<void>,
  setAligning: (aligning: boolean) => void,
): Promise<void> {
  setAligning(true);
  try {
    const judged = await runAnchorSweep();
    if (judged !== null && judged > 0) await refresh();
  } catch (error) {
    console.warn("anchor sweep skipped:", error);
  } finally {
    setAligning(false);
  }
}

function mirrorOf(
  viewState: CompareProfileViewState,
): Pick<CompareState, "expandedKeys" | "detailKey"> {
  return { expandedKeys: viewState.expandedKeys, detailKey: viewState.detailKey };
}

export interface CompareSelectionActions {
  selectProfile(profileId: string): Promise<void>;
  /** Builds the chosen occupation's profile offline and selects it (spec 026). */
  createOccupation(code: string): Promise<void>;
  /** Records the learner's own 0–10 score for an experience leaf and rescores the tree. */
  setPracticeScore(itemId: string, score: number): Promise<void>;
  /** Opens (or resumes) the saved-but-sidebar-hidden discussion for a practice item. */
  discussPractice(node: OverlapNode): Promise<void>;
}

export function createCompareSelectionActions(
  set: (patch: Partial<CompareState>) => void,
  get: () => CompareState,
): CompareSelectionActions {
  return {
    async selectProfile(profileId) {
      // Save the outgoing profile's expansion/detail state before switching (VS Code
      // explorer model) — a peek at another profile must not lose a deep expansion. The
      // restore happens atomically with selectedProfileId/tree below so old and new state
      // never render mixed together.
      const outgoing = get().selectedProfileId;
      const viewStateByProfile = new Map(get().viewStateByProfile);
      if (outgoing !== null) {
        viewStateByProfile.set(outgoing, {
          expandedKeys: get().expandedKeys,
          detailKey: get().detailKey,
        });
      }
      set({ loading: true, viewStateByProfile });
      try {
        // Immediate path (spec 024 §2): the string-matched tree renders NOW; semantic
        // alignment runs behind it and quietly patches the tree when new verdicts land.
        const repos = await getRepos();
        const [tree, scores] = await Promise.all([
          computeComparisonTree(profileId),
          repos.practice.listScores(),
        ]);
        const restored = viewStateByProfile.get(profileId) ?? EMPTY_PROFILE_VIEW_STATE;
        set({
          selectedProfileId: profileId,
          tree,
          scoreByItemId: new Map(scores.map((row) => [row.item_id, row.score])),
          loading: false,
          goalNote: null,
          ...mirrorOf(restored),
        });
        void sweepInBackground(
          async () => {
            const selected = get().selectedProfileId;
            if (selected === null) return;
            const refreshed = await computeComparisonTree(selected);
            // The user may have switched profiles during the sweep — a stale tree must
            // never land under the newly selected profile's title.
            if (get().selectedProfileId === selected) set({ tree: refreshed });
          },
          (aligning) => set({ aligning }),
        );
      } catch (error) {
        console.warn("comparison tree compute skipped:", error);
        set({ loading: false });
      }
    },

    async createOccupation(code) {
      set({ loading: true });
      try {
        const profileId = await createOccupationProfile(code);
        await get().load();
        if (profileId !== null) await get().selectProfile(profileId);
        else set({ loading: false });
      } catch (error) {
        console.warn("occupation profile creation skipped:", error);
        set({ loading: false });
      }
    },

    async setPracticeScore(itemId, score) {
      try {
        const repos = await getRepos();
        await repos.practice.upsertScore({
          item_id: itemId,
          score,
          scored_at: nowIso(),
        });
        const next = new Map(get().scoreByItemId);
        next.set(itemId, score);
        set({ scoreByItemId: next });
        const selected = get().selectedProfileId;
        if (selected !== null) {
          const tree = await computeComparisonTree(selected);
          if (get().selectedProfileId === selected) set({ tree });
        }
      } catch (error) {
        console.warn("practice score skipped:", error);
      }
    },

    async discussPractice(node) {
      try {
        const conversationId = await openPracticeConversation(node.label, node.sourceRef);
        appEventBus.emit("app:navigateChat", { conversationId });
      } catch (error) {
        console.warn("practice discussion skipped:", error);
      }
    },
  };
}
