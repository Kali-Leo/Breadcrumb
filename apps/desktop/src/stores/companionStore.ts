/**
 * Purpose: zustand store for the daily helper companions (spec 050 §9, Leo's redesign of
 * spec 037) — each day the gate turns the footprinted concepts a review would help most
 * (feature-memory's review priority) into up to three help-seeking characters ("想弄懂 X 的同学", the ported teachable-agent
 * paradigm); talking to one drives mastery judgment underneath; once a teach-quality
 * claim lands the helper thanks the learner and leaves the roster. No same-day refills:
 * yesterday's leftovers expire, tomorrow brings a fresh batch. Also keeps crisis
 * detection and the break reminder. The gate run itself and its day-change / switch-toggle
 * triggers live in lib/companion/companionDailyGate.ts.
 * Side effects on import: subscribes to chat:responseFinished / chat:messageSent.
 * Main exports: useCompanionStore, HELPER_ID_PREFIX.
 */
import type { CompanionProposalRow } from "@breadcrumb/core-db";
import { detectCrisis } from "@breadcrumb/feature-companion";
import { create } from "zustand";
import {
  type BreakReminderState,
  dismissBreakReminder as dismissBreakReminderState,
  INITIAL_BREAK_REMINDER_STATE,
  recordCompanionActivity,
} from "../lib/companion/companionBreakReminder";
import {
  HELPER_ID_PREFIX,
  runDailyHelperGate,
  wireDailyHelperGateTriggers,
} from "../lib/companion/companionDailyGate";
import { appendHelperThanks } from "../lib/companion/companionHelperConversation";
import { recordCompanionMemoryForFinishedRound } from "../lib/companion/companionMemoryActions";
import { getRepos } from "../lib/platform/db";
import { nowIso } from "../lib/platform/time";
import { appEventBus, useChatStore } from "./chatStore";
import { useSettingsStore } from "./settingsStore";

export { HELPER_ID_PREFIX };

/** Without a quality verdict (switch off / offline), this many learner replies count as
 * "did what could be done" and the helper thanks and leaves. */
const FALLBACK_REPLY_LIMIT = 3;

/** Conversations whose helper-completion check is in flight — two rounds finishing close
 * together must not thank twice. */
const completingConversationIds = new Set<string>();

interface CompanionState extends BreakReminderState {
  /** Today's pending helpers — the whole roster (spec 050 §9: like a daily task list). */
  helpers: CompanionProposalRow[];
  seenHelperIds: ReadonlySet<string>;
  crisisConversationIds: ReadonlySet<string>;
  initialize(): Promise<void>;
  /** Expires stale helpers, generates today's batch once per day, refreshes the roster. */
  refreshDailyHelpers(): Promise<void>;
  markHelperSeen(helperId: string): void;
  /** Called after each finished round in a helper conversation — thanks and resolves once
   * a teach-quality claim landed for the node (or the fallback reply count is reached). */
  completeHelperIfReady(conversationId: string): Promise<void>;
  checkUserMessageForCrisis(content: string, conversationId: string): boolean;
  dismissCrisis(conversationId: string): void;
  recordActivity(): void;
  dismissBreakReminder(): void;
}

async function completeHelperOnce(
  conversationId: string,
  get: () => CompanionState,
  set: (patch: Partial<CompanionState>) => void,
): Promise<void> {
  const repos = await getRepos();
  const conversation = await repos.conversations.getById(conversationId);
  const helperId = conversation?.companion_id;
  if (
    conversation === null ||
    helperId === null ||
    helperId === undefined ||
    !helperId.startsWith(HELPER_ID_PREFIX)
  ) {
    return;
  }
  const helper = get().helpers.find((row) => row.companion_id === helperId);
  if (helper === undefined) return;

  // The confirmation is a teach-quality claim on the helper's node recorded after the
  // helper appeared — judged ONLY from explanations inside this conversation (the judge
  // reads this conversation; asking the main chat for the answer earns nothing here).
  let confirmed = false;
  if (helper.node_id !== null) {
    const claims = await repos.masteryClaims.listAll();
    confirmed = claims.some(
      (claim) =>
        claim.node_id === helper.node_id &&
        claim.created_at >= helper.created_at &&
        (claim.level === "taught_principled" || claim.level === "taught_surface"),
    );
  }
  if (!confirmed) {
    const messages = await repos.messages.listByConversation(conversationId);
    const learnerReplies = messages.filter((message) => message.role === "user").length;
    if (learnerReplies < FALLBACK_REPLY_LIMIT) return;
  }

  await appendHelperThanks(conversationId, helper.topic);
  await repos.companionProposals.resolve(helper.id, "accepted", nowIso());
  set({ helpers: get().helpers.filter((row) => row.id !== helper.id) });
}

function breakReminderSlice(state: BreakReminderState): BreakReminderState {
  return {
    activityTimestampsMs: state.activityTimestampsMs,
    breakReminderActive: state.breakReminderActive,
    nextBreakReminderDueMs: state.nextBreakReminderDueMs,
  };
}

export const useCompanionStore = create<CompanionState>((set, get) => ({
  helpers: [],
  seenHelperIds: new Set<string>(),
  crisisConversationIds: new Set<string>(),
  ...INITIAL_BREAK_REMINDER_STATE,

  async initialize() {
    wireDailyHelperGateTriggers(() => {
      void useCompanionStore.getState().refreshDailyHelpers();
    });
    await get().refreshDailyHelpers();
  },

  async refreshDailyHelpers() {
    if (!useSettingsStore.getState().featureSwitches.companionChat) {
      set({ helpers: [] });
      return;
    }
    const helpers = await runDailyHelperGate();
    if (helpers !== null) set({ helpers });
  },

  markHelperSeen(helperId) {
    const seen = new Set(get().seenHelperIds);
    if (seen.has(helperId)) return;
    seen.add(helperId);
    set({ seenHelperIds: seen });
  },

  async completeHelperIfReady(conversationId) {
    if (completingConversationIds.has(conversationId)) return;
    completingConversationIds.add(conversationId);
    try {
      await completeHelperOnce(conversationId, get, set);
    } finally {
      completingConversationIds.delete(conversationId);
    }
  },

  checkUserMessageForCrisis(content, conversationId) {
    const fired = detectCrisis(content);
    if (fired) {
      const next = new Set(get().crisisConversationIds);
      next.add(conversationId);
      set({ crisisConversationIds: next });
    }
    return fired;
  },

  dismissCrisis(conversationId) {
    const next = new Set(get().crisisConversationIds);
    next.delete(conversationId);
    set({ crisisConversationIds: next });
  },

  recordActivity() {
    set(recordCompanionActivity(breakReminderSlice(get()), Date.now()));
  },

  dismissBreakReminder() {
    set(dismissBreakReminderState(breakReminderSlice(get()), Date.now()));
  },
}));

// After each finished round: helper completion check (pure/cheap reads unless it resolves)
// and — for the legacy fixed-cast conversations that remain openable — memory recording,
// which is metered and switch-gated inside recordCompanionMemoryForFinishedRound itself.
appEventBus.on("chat:responseFinished", ({ conversationId }) => {
  void useCompanionStore.getState().completeHelperIfReady(conversationId);
  void recordCompanionMemoryForFinishedRound(conversationId);
});

appEventBus.on("chat:messageSent", ({ conversationId }) => {
  const kind = useChatStore.getState().kindFor(conversationId);
  if (kind !== "companion" && kind !== "teach") return;
  useCompanionStore.getState().recordActivity();
});
