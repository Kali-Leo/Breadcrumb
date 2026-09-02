/**
 * Purpose: zustand store for the daily helper companions (spec 050 §9, Leo's redesign of
 * spec 037) — each day the gate turns the footprinted concepts a review would help most
 * (plugin-memory's review priority) into up to three help-seeking characters ("想弄懂 X 的同学", the ported teachable-agent
 * paradigm); talking to one drives mastery judgment underneath; once a teach-quality
 * claim lands the helper thanks the learner and leaves the roster. No same-day refills:
 * yesterday's leftovers expire, tomorrow brings a fresh batch. Also keeps crisis
 * detection and the break reminder.
 * Side effects on import: subscribes to chat:responseFinished / chat:messageSent.
 * Main exports: useCompanionStore, HELPER_ID_PREFIX.
 */
import type { CompanionProposalRow } from "@breadcrumb/core-db";
import { detectCrisis } from "@breadcrumb/plugin-companion";
import { create } from "zustand";
import { appendHelperThanks, startHelperConversation } from "../lib/companionActions";
import {
  type BreakReminderState,
  dismissBreakReminder as dismissBreakReminderState,
  INITIAL_BREAK_REMINDER_STATE,
  recordCompanionActivity,
} from "../lib/companionBreakReminder";
import { recordCompanionMemoryForFinishedRound } from "../lib/companionMemoryActions";
import { getRepos } from "../lib/db";
import { pickTeachCandidates } from "../lib/teachActions";
import { newId, nowIso, onLocalDayChange, todayLocalMidnightIso } from "../lib/time";
import { appEventBus, useChatStore } from "./chatStore";
import { useKnowledgeStore } from "./knowledgeStore";
import { useMemoryStore } from "./memoryStore";
import { useSettingsStore } from "./settingsStore";

export const HELPER_ID_PREFIX = "helper-";
const DAILY_HELPER_LIMIT = 3;
/** A concept that had a helper within this window doesn't get another one yet. */
const HELPER_REPEAT_COOLDOWN_DAYS = 7;
const LOOKBACK_MS = 30 * 24 * 3_600_000;
/** Without a quality verdict (switch off / offline), this many learner replies count as
 * "did what could be done" and the helper thanks and leaves. */
const FALLBACK_REPLY_LIMIT = 3;

/** Serializes overlapping gate runs (StrictMode double-mount, bus bursts). */
let gateRunInFlight = false;
/** Conversations whose helper-completion check is in flight — two rounds finishing close
 * together must not thank twice. */
const completingConversationIds = new Set<string>();
/** Guards the day-change/switch-toggle re-gate wiring below against being registered twice
 * (StrictMode double-invokes initialize()) — module scope survives both invocations. */
let dailyGateTriggersWired = false;

/** Re-runs the daily-helper gate when the local day rolls over (an app left open across
 * midnight must not keep yesterday's roster until restart) and when the companionChat
 * switch flips off→on (toggling it back on must not leave helpers empty until restart).
 * Wired once per module lifetime from initialize(). */
function wireDailyHelperGateTriggers(): void {
  if (dailyGateTriggersWired) return;
  dailyGateTriggersWired = true;
  onLocalDayChange(() => {
    void useCompanionStore.getState().refreshDailyHelpers();
  });
  let previousCompanionChatEnabled = useSettingsStore.getState().featureSwitches.companionChat;
  useSettingsStore.subscribe((state) => {
    const enabled = state.featureSwitches.companionChat;
    if (enabled && !previousCompanionChatEnabled) {
      void useCompanionStore.getState().refreshDailyHelpers();
    }
    previousCompanionChatEnabled = enabled;
  });
}

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
    wireDailyHelperGateTriggers();
    await get().refreshDailyHelpers();
  },

  async refreshDailyHelpers() {
    if (!useSettingsStore.getState().featureSwitches.companionChat) {
      set({ helpers: [] });
      return;
    }
    if (gateRunInFlight) return;
    gateRunInFlight = true;
    try {
      const repos = await getRepos();
      const now = nowIso();
      const todayStart = todayLocalMidnightIso();
      const sinceIso = new Date(Date.parse(now) - LOOKBACK_MS).toISOString();
      const rows = await repos.companionProposals.listRecent(sinceIso);

      // Yesterday's unhandled helpers leave quietly — tomorrow is a fresh page.
      for (const row of rows) {
        if (row.status === "pending" && row.created_at < todayStart) {
          await repos.companionProposals.resolve(row.id, "expired", now);
        }
      }

      const todays = rows.filter((row) => row.created_at >= todayStart);
      if (todays.length === 0) {
        await useMemoryStore.getState().refresh();
        const nodes = useKnowledgeStore.getState().nodes;
        const reviewPriorityByNode = useMemoryStore.getState().reviewPriorityByNode;
        const cooldownStart = new Date(
          Date.parse(todayStart) - HELPER_REPEAT_COOLDOWN_DAYS * 24 * 3_600_000,
        ).toISOString();
        const recentNodeIds = new Set(
          rows.filter((row) => row.created_at >= cooldownStart).map((row) => row.node_id),
        );
        const candidates = pickTeachCandidates(nodes, reviewPriorityByNode, DAILY_HELPER_LIMIT * 2)
          .filter((node) => !recentNodeIds.has(node.id))
          .slice(0, DAILY_HELPER_LIMIT);
        for (const node of candidates) {
          const helperId = `${HELPER_ID_PREFIX}${node.id}`;
          await startHelperConversation(helperId, node.label);
          const row: CompanionProposalRow = {
            id: newId(),
            companion_id: helperId,
            node_id: node.id,
            topic: node.label,
            kind: "teach",
            status: "pending",
            created_at: nowIso(),
            resolved_at: null,
          };
          await repos.companionProposals.insert(row);
          todays.push(row);
        }
        if (candidates.length > 0) await useChatStore.getState().loadFromDatabase();
      }

      set({ helpers: todays.filter((row) => row.status === "pending") });
    } finally {
      gateRunInFlight = false;
    }
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
