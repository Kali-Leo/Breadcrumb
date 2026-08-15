/**
 * Purpose: zustand store for the companion cast (spec 037) — loaded cards, the proactive
 * teach-back proposal gate (invitation delivered as her own chat message; replying accepts,
 * Leo 2026-08-15), crisis detection, and the break reminder.
 * Subscribes to chat:responseFinished (gate re-evaluation + memory recording) and
 * chat:messageSent (break-reminder activity tracking) at module load, mirroring
 * knowledgeStore/memoryStore's own subscription pattern.
 * Main exports: useCompanionStore.
 */
import type { CompanionProposalKind, CompanionProposalRow } from "@breadcrumb/core-db";
import type { CompanionCard } from "@breadcrumb/plugin-companion";
import {
  DEFAULT_QUIET_HOURS,
  decideProposal,
  detectCrisis,
  loadCompanionCards,
} from "@breadcrumb/plugin-companion";
import { DEFAULT_REUNION_WAITING_THRESHOLD, pickReunionInvites } from "@breadcrumb/plugin-feedback";
import { create } from "zustand";
import { appendCompanionInvitation, seedTeachScriptForConversation } from "../lib/companionActions";
import {
  type BreakReminderState,
  dismissBreakReminder as dismissBreakReminderState,
  INITIAL_BREAK_REMINDER_STATE,
  recordCompanionActivity,
} from "../lib/companionBreakReminder";
import { recordCompanionMemoryForFinishedRound } from "../lib/companionMemoryActions";
import { sweepExpiredProposals } from "../lib/companionProposalGate";
import { getRepos } from "../lib/db";
import { pickTeachCandidates } from "../lib/teachActions";
import { newId, nowIso } from "../lib/time";
import { appEventBus, useChatStore } from "./chatStore";
import { useKnowledgeStore } from "./knowledgeStore";
import { useMemoryStore } from "./memoryStore";
import { useSettingsStore } from "./settingsStore";

const PROPOSAL_LOOKBACK_MS = 30 * 24 * 3_600_000;

/** Serializes overlapping gate evaluations (React StrictMode double-mount, bus bursts) —
 * without this, two concurrent runs can both see "no pending" and insert duplicates. */
let proposalGateEvaluationInFlight = false;

interface CompanionState extends BreakReminderState {
  cards: CompanionCard[];
  activeProposal: CompanionProposalRow | null;
  /** Unread state for the pending proposal (the sidebar dot): false until the learner has
   * opened the companion conversation holding the invitation message, then true. */
  proposalSeen: boolean;
  crisisActive: boolean;
  initialize(): Promise<void>;
  evaluateProposalGate(): Promise<void>;
  /** Internal single-run body of the gate — call evaluateProposalGate, which serializes. */
  runProposalGateOnce(): Promise<void>;
  /** Replying in the companion's chat IS accepting (Leo 2026-08-15, no buttons): resolves the
   * pending proposal and seeds this conversation's teach script before the round runs. */
  acceptProposalByReply(conversationId: string, companionId: string): Promise<void>;
  /** Returns whether THIS call detected a crisis (not the sticky crisisActive flag) — the
   * caller uses that to decide whether to add this round's out-of-persona interrupt line. */
  checkUserMessageForCrisis(content: string): boolean;
  markProposalSeen(): void;
  dismissCrisis(): void;
  recordActivity(): void;
  dismissBreakReminder(): void;
}

function breakReminderSlice(state: BreakReminderState): BreakReminderState {
  return {
    activityTimestampsMs: state.activityTimestampsMs,
    breakReminderActive: state.breakReminderActive,
    nextBreakReminderDueMs: state.nextBreakReminderDueMs,
  };
}

export const useCompanionStore = create<CompanionState>((set, get) => ({
  cards: [],
  activeProposal: null,
  proposalSeen: false,
  crisisActive: false,
  ...INITIAL_BREAK_REMINDER_STATE,

  async initialize() {
    set({ cards: loadCompanionCards() });
    await get().evaluateProposalGate();
  },

  async evaluateProposalGate() {
    const settings = useSettingsStore.getState();
    if (!settings.featureSwitches.companionChat) {
      set({ activeProposal: null });
      return;
    }
    if (proposalGateEvaluationInFlight) return;
    proposalGateEvaluationInFlight = true;
    try {
      await get().runProposalGateOnce();
    } finally {
      proposalGateEvaluationInFlight = false;
    }
  },

  async runProposalGateOnce() {
    const repos = await getRepos();
    const now = nowIso();
    const sinceIso = new Date(Date.parse(now) - PROPOSAL_LOOKBACK_MS).toISOString();
    const rows = await repos.companionProposals.listRecent(sinceIso);
    const sweep = sweepExpiredProposals(rows, now);
    for (const id of sweep.newlyExpiredIds) {
      await repos.companionProposals.resolve(id, "expired", now);
    }

    const pending = sweep.updatedRows.find((row) => row.status === "pending") ?? null;
    if (pending !== null) {
      // A different proposal than the one on screen is unread again; the same one keeps
      // whatever seen-state it had (gate re-runs after every chat round).
      if (get().activeProposal?.id !== pending.id)
        set({ activeProposal: pending, proposalSeen: false });
      return;
    }

    // Retention only refreshes after chat rounds (memoryStore's own subscription) — recompute
    // it here too so the very first gate run of a session sees real numbers, not an empty map.
    await useMemoryStore.getState().refresh();
    const nodes = useKnowledgeStore.getState().nodes;
    const retentionByNode = useMemoryStore.getState().retentionByNode;

    // Teach-back and reunion invitations alternate (spec 048 §5) — whichever kind went out
    // last, the other goes next, falling back when one has no candidates. Both share the
    // same rate/quiet-hours gate.
    const teachTopics = pickTeachCandidates(nodes, retentionByNode, 3).map((node) => ({
      nodeId: node.id,
      topic: node.label,
    }));
    const nodeTitles = new Map(nodes.map((node) => [node.id, node.label]));
    const reunionTopics = pickReunionInvites(retentionByNode, nodeTitles, {
      limit: 3,
      waitingThreshold: DEFAULT_REUNION_WAITING_THRESHOLD,
    }).invites.map((invite) => ({ nodeId: invite.nodeId, topic: invite.title }));

    const lastKind: CompanionProposalKind = sweep.updatedRows[0]?.kind ?? "reunion";
    const preferredKind: CompanionProposalKind = lastKind === "teach" ? "reunion" : "teach";
    const preferredTopics = preferredKind === "teach" ? teachTopics : reunionTopics;
    const kind: CompanionProposalKind =
      preferredTopics.length > 0 ? preferredKind : preferredKind === "teach" ? "reunion" : "teach";
    const candidateTopics = kind === "teach" ? teachTopics : reunionTopics;

    const decision = decideProposal({
      nowIso: now,
      recentProposals: sweep.updatedRows,
      candidateTopics,
      quietHours: DEFAULT_QUIET_HOURS,
    });
    if (decision.verdict !== "propose") {
      set({ activeProposal: null });
      return;
    }
    const row: CompanionProposalRow = {
      id: newId(),
      // Shichimi (the student) asks to be taught; Cumin (the mentor) invites a reunion.
      companion_id: kind === "teach" ? "shichimi" : "cumin",
      node_id: decision.nodeId,
      topic: decision.topic,
      kind,
      status: "pending",
      created_at: now,
      resolved_at: null,
    };
    await repos.companionProposals.insert(row);
    // The invitation is delivered as the companion's own chat message — the sidebar dot
    // marks it unread.
    await appendCompanionInvitation(row.companion_id, row.topic, row.kind);
    set({ activeProposal: row, proposalSeen: false });
  },

  markProposalSeen() {
    if (!get().proposalSeen) set({ proposalSeen: true });
  },

  async acceptProposalByReply(conversationId, companionId) {
    const proposal = get().activeProposal;
    if (proposal === null || proposal.companion_id !== companionId) return;
    const repos = await getRepos();
    await repos.companionProposals.resolve(proposal.id, "accepted", nowIso());
    set({ activeProposal: null, proposalSeen: true });
    // A reunion needs no teach script — the invitation itself is the context and the
    // conversation simply continues (spec 048 §5).
    if (proposal.kind === "reunion") return;
    const knownNodeLabels = useKnowledgeStore.getState().nodes.map((node) => node.label);
    await seedTeachScriptForConversation(conversationId, proposal.topic, knownNodeLabels);
  },

  checkUserMessageForCrisis(content) {
    const fired = detectCrisis(content);
    if (fired) set({ crisisActive: true });
    return fired;
  },

  dismissCrisis() {
    set({ crisisActive: false });
  },

  recordActivity() {
    set(recordCompanionActivity(breakReminderSlice(get()), Date.now()));
  },

  dismissBreakReminder() {
    set(dismissBreakReminderState(breakReminderSlice(get()), Date.now()));
  },
}));

// Re-evaluating the gate is pure/cheap (no LLM call unless it decides to propose); memory
// recording is metered and switch-gated inside recordCompanionMemoryForFinishedRound itself.
appEventBus.on("chat:responseFinished", ({ conversationId }) => {
  void useCompanionStore.getState().evaluateProposalGate();
  void recordCompanionMemoryForFinishedRound(conversationId);
});

appEventBus.on("chat:messageSent", () => {
  const activeKind = useChatStore.getState().activeKind;
  if (activeKind !== "companion" && activeKind !== "teach") return;
  useCompanionStore.getState().recordActivity();
});
