/**
 * Purpose: zustand store for the mirror modules (spec 035; graduated into the palace by
 * spec 046) — loads every source table once and holds the surviving view models, plus the
 * on-demand evidence lookup and the reunion invite's "start a chat" side effect.
 * Main exports: useFeedbackStore.
 */
import type {
  CumulativeTotals,
  DailyActivityCell,
  NodeEvidence,
  ReunionInvite,
  SettledResult,
  SmallWin,
} from "@breadcrumb/plugin-feedback";
import { buildNodeEvidence } from "@breadcrumb/plugin-feedback";
import { create } from "zustand";
import { startReunionSession } from "../lib/feedbackActions";
import { type EvidenceCandidate, type FeedbackData, loadFeedbackData } from "../lib/feedbackData";
import { appEventBus, useChatStore } from "./chatStore";

// Raw rows the on-demand evidence lookup needs — they never render directly, only feed
// buildNodeEvidence once a concept is picked, so they live outside reactive state.
let rawSightings: FeedbackData["sightings"] = [];
let rawConversationTitlesById: FeedbackData["conversationTitlesById"] = new Map();
let rawRetentionByNode: FeedbackData["retentionByNode"] = new Map();
let rawMasteryClaims: FeedbackData["masteryClaims"] = [];

interface FeedbackState {
  loaded: boolean;
  cells: DailyActivityCell[];
  continuity: { activeDays: number; longestRunDays: number; currentRunDays: number };
  smallWinsToday: SmallWin[];
  smallWinsWeek: SmallWin[];
  totals: CumulativeTotals | null;
  reunion: { waitingCount: number; invites: ReunionInvite[] };
  settled: SettledResult;
  evidenceCandidates: EvidenceCandidate[];
  selectedEvidenceNodeId: string | null;
  evidence: NodeEvidence | null;
  loadAll(): Promise<void>;
  selectEvidenceNode(nodeId: string): void;
  openReunion(title: string): Promise<void>;
}

export const useFeedbackStore = create<FeedbackState>((set) => ({
  loaded: false,
  cells: [],
  continuity: { activeDays: 0, longestRunDays: 0, currentRunDays: 0 },
  smallWinsToday: [],
  smallWinsWeek: [],
  totals: null,
  reunion: { waitingCount: 0, invites: [] },
  settled: { nodes: [], words: [] },
  evidenceCandidates: [],
  selectedEvidenceNodeId: null,
  evidence: null,

  async loadAll() {
    const data = await loadFeedbackData();
    rawSightings = data.sightings;
    rawConversationTitlesById = data.conversationTitlesById;
    rawRetentionByNode = data.retentionByNode;
    rawMasteryClaims = data.masteryClaims;
    set({
      loaded: true,
      cells: data.cells,
      continuity: data.continuity,
      smallWinsToday: data.smallWinsToday,
      smallWinsWeek: data.smallWinsWeek,
      totals: data.totals,
      reunion: data.reunion,
      settled: data.settled,
      evidenceCandidates: data.evidenceCandidates,
    });
  },

  selectEvidenceNode(nodeId) {
    const evidence = buildNodeEvidence(nodeId, {
      sightings: rawSightings,
      conversationTitlesById: rawConversationTitlesById,
      retention: rawRetentionByNode.get(nodeId) ?? null,
      masteryClaims: rawMasteryClaims,
    });
    set({ selectedEvidenceNodeId: nodeId, evidence });
  },

  async openReunion(title) {
    const conversationId = await startReunionSession(title);
    // The sidebar's chat list only refreshes from its own store — creating the
    // conversation here bypasses it, so pull it in line before navigating.
    await useChatStore.getState().loadFromDatabase();
    appEventBus.emit("app:navigateChat", { conversationId });
  },
}));
