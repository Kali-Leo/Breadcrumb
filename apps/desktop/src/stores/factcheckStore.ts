/**
 * Purpose: zustand store for fact-check runs — per-message checking through the
 * feature-factcheck pipeline, metering (purpose "factcheck"), gentle notices, and the stage a
 * running check has reached (the chat shows the waiting as the work it is). Claims are
 * layered per conversation, filled on first visit and never wiped on switch; layers
 * accumulate for every conversation visited this app session (the Discord tradeoff). The
 * database side lives in lib/factcheck/factcheckRecords.ts.
 * Main exports: useFactcheckStore, DisplayClaim.
 */
import type { CopyMessage } from "@breadcrumb/core-i18n";
import { type FactCheckStage, runFactCheck } from "@breadcrumb/feature-factcheck";
import { create } from "zustand";
import { recordFailedCallUsage, recordMeteredCall } from "../lib/billing/metering";
import { createSingleFlightLoader, setConversationLayer } from "../lib/chat/conversationLayers";
import { currentEvidenceProviders } from "../lib/factcheck/evidenceProviders";
import {
  type DisplayClaim,
  loadConversationLayer,
  persistRun,
  resolveRoundMessages,
} from "../lib/factcheck/factcheckRecords";
import { degradeSilently, recordAiFailure } from "../lib/platform/failureLog";
import { llmConfigFrom } from "../lib/platform/llmConfig";
import { appEventBus, useChatStore } from "./chatStore";
import { useSettingsStore } from "./settingsStore";

export type { DisplayClaim } from "../lib/factcheck/factcheckRecords";
export type { FactCheckStage };

const OFFLINE_NOTICE: CopyMessage = { key: "chat:factcheck.offlineNotice" };
const NO_API_NOTICE: CopyMessage = { key: "chat:factcheck.noApiNotice" };
const FAILED_NOTICE: CopyMessage = { key: "chat:factcheck.failedNotice" };
const NO_SOURCES_NOTICE: CopyMessage = { key: "chat:factcheck.noSourcesNotice" };
const AUTO_PAUSED_NOTICE: CopyMessage = { key: "chat:factcheck.autoPausedNotice" };

interface FactcheckState {
  /** Checked claims per conversation, then per assistant message (an empty claim array =
   * checked, nothing to verify). Source of truth — badges read their conversation's layer. */
  claimsByConversation: ReadonlyMap<string, ReadonlyMap<string, DisplayClaim[]>>;
  checkingMessageIds: ReadonlySet<string>;
  /** How far the running check has got, per message — shown while it runs, cleared when it
   * ends. Waiting that says what it is doing reads as work; a spinner reads as a stall. */
  stageByMessageId: Record<string, FactCheckStage>;
  noticeByMessageId: Record<string, CopyMessage>;
  /** Fill-on-first-visit: loads a conversation's layer once; revisits are instant cache hits. */
  ensureLoaded(conversationId: string | null): Promise<void>;
  checkMessage(conversationId: string, messageId: string): Promise<void>;
  /** Said once, on the answer where the automatic runs stood down — see lib/factcheck/
   * autoFactcheck.ts. Every further answer stays quiet rather than repeating the failure. */
  noteAutoPaused(messageId: string): void;
}

const singleFlightLoad = createSingleFlightLoader();

export const useFactcheckStore = create<FactcheckState>((set, get) => ({
  claimsByConversation: new Map(),
  checkingMessageIds: new Set(),
  stageByMessageId: {},
  noticeByMessageId: {},

  async ensureLoaded(conversationId) {
    if (conversationId === null || get().claimsByConversation.has(conversationId)) return;
    await singleFlightLoad(conversationId, async () => {
      if (get().claimsByConversation.has(conversationId)) return;
      const layer = await loadConversationLayer(conversationId);
      // A check that finished while we loaded already wrote its layer — the fresher
      // in-memory entries win over this DB snapshot.
      const existing = get().claimsByConversation.get(conversationId);
      const merged = existing === undefined ? layer : new Map([...layer, ...existing]);
      set({
        claimsByConversation: setConversationLayer(
          get().claimsByConversation,
          conversationId,
          merged,
        ),
      });
    });
  },

  noteAutoPaused(messageId) {
    setNotice(messageId, AUTO_PAUSED_NOTICE);
  },

  async checkMessage(conversationId, messageId) {
    // One round is checked once at a time, whoever asked: the automatic run and the button
    // both land here, and a second pass would bill the same answer twice.
    if (get().checkingMessageIds.has(messageId)) return;
    const settings = useSettingsStore.getState();
    if (!settings.networkEnabled) return setNotice(messageId, OFFLINE_NOTICE);
    if (!settings.apiConfig) return setNotice(messageId, NO_API_NOTICE);
    // Decided before anything is spent: with no evidence source reachable from here (the
    // browser edition on a mainland network, no search key) there is nothing to check
    // against, and saying so is the whole result — not "没找到佐证" about a world never looked at.
    const providers = currentEvidenceProviders(settings);
    if (providers.length === 0) return setNotice(messageId, NO_SOURCES_NOTICE);

    // Claimed before the first await, so a button press during an automatic run finds the
    // marker already set rather than slipping past the guard above.
    set({ checkingMessageIds: new Set([...get().checkingMessageIds, messageId]) });
    try {
      const { answer, question } = await resolveRoundMessages(
        conversationId,
        useChatStore.getState().messagesFor(conversationId),
        messageId,
      );
      if (answer === undefined || question === undefined) return;
      const report = await runFactCheck(
        {
          // Through lib/platform/llmConfig rather than hand-assembled: that module is where the
          // network switch is enforced, and a config built here would be a second door.
          // With the answer-language directive, like every other learner-facing call: the
          // claim and the verdict's reasoning are rendered under the answer, so they are
          // written in the language the learner reads.
          llmConfig: llmConfigFrom(settings.apiConfig),
          providers,
          onStage: (stage) => setStage(messageId, stage),
        },
        question.content,
        answer.content,
      );
      await recordMeteredCall({
        purpose: "factcheck",
        model: settings.apiConfig.model,
        conversationId,
        usage: report.usage,
      });
      recordProviderFailures(report.failedProviders);

      const { runId, displayClaims } = await persistRun(conversationId, messageId, report.claims);
      appEventBus.emit("factcheck:finished", { conversationId, messageId, runId });

      // The result lands in ITS conversation's layer — correct even if the user switched away.
      const layer = new Map(get().claimsByConversation.get(conversationId) ?? []);
      layer.set(messageId, displayClaims);
      set({
        claimsByConversation: setConversationLayer(
          get().claimsByConversation,
          conversationId,
          layer,
        ),
        noticeByMessageId: withoutKey(get().noticeByMessageId, messageId),
      });
    } catch (error) {
      void degradeSilently("factcheck", error);
      // The claim-extraction call may have reached the provider (and been billed) before it
      // gave up; recordMeteredCall above is never reached on this path.
      void recordFailedCallUsage(error, {
        purpose: "factcheck",
        model: settings.apiConfig.model,
        conversationId,
      });
      setNotice(messageId, FAILED_NOTICE);
    } finally {
      set({
        checkingMessageIds: new Set([...get().checkingMessageIds].filter((id) => id !== messageId)),
        stageByMessageId: withoutKey(get().stageByMessageId, messageId),
      });
    }
  },
}));

/** A search source going dark is exactly the silent degradation the debug table exists
 * for — the headless module can only report it, the host has the database. */
function recordProviderFailures(failedProviders: readonly string[]): void {
  for (const provider of failedProviders) {
    void recordAiFailure(
      "factcheck",
      `evidence provider "${provider}" could not complete a search (blocked network, non-OK response, markup drift, or no candidate page openable)`,
    );
  }
}

function setStage(messageId: string, stage: FactCheckStage): void {
  useFactcheckStore.setState((state) => ({
    stageByMessageId: { ...state.stageByMessageId, [messageId]: stage },
  }));
}

function setNotice(messageId: string, text: CopyMessage): void {
  useFactcheckStore.setState((state) => ({
    noticeByMessageId: { ...state.noticeByMessageId, [messageId]: text },
  }));
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}
