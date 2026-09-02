/**
 * Purpose: zustand store for fact-check runs — manual per-message checking through the
 * feature-factcheck pipeline, metering (purpose "factcheck"), gentle notices. Claims are
 * layered per conversation, filled on first visit and never wiped on switch; layers
 * accumulate for every conversation visited this app session (the Discord tradeoff). The
 * database side lives in lib/factcheck/factcheckRecords.ts.
 * Main exports: useFactcheckStore, DisplayClaim.
 */
import type { CopyMessage } from "@breadcrumb/core-i18n";
import { createDefaultEvidenceProviders, runFactCheck } from "@breadcrumb/feature-factcheck";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { create } from "zustand";
import { recordFailedCallUsage, recordMeteredCall } from "../lib/billing/metering";
import { createSingleFlightLoader, setConversationLayer } from "../lib/chat/conversationLayers";
import {
  type DisplayClaim,
  loadConversationLayer,
  persistRun,
  resolveRoundMessages,
} from "../lib/factcheck/factcheckRecords";
import { recordAiFailure } from "../lib/platform/failureLog";
import { llmConfigWithoutLanguageDirective } from "../lib/platform/llmConfig";
import { appEventBus, useChatStore } from "./chatStore";
import { useSettingsStore } from "./settingsStore";

export type { DisplayClaim } from "../lib/factcheck/factcheckRecords";

const OFFLINE_NOTICE: CopyMessage = { key: "chat:factcheck.offlineNotice" };
const NO_API_NOTICE: CopyMessage = { key: "chat:factcheck.noApiNotice" };
const FAILED_NOTICE: CopyMessage = { key: "chat:factcheck.failedNotice" };

interface FactcheckState {
  /** Checked claims per conversation, then per assistant message (an empty claim array =
   * checked, nothing to verify). Source of truth — badges read their conversation's layer. */
  claimsByConversation: ReadonlyMap<string, ReadonlyMap<string, DisplayClaim[]>>;
  checkingMessageIds: ReadonlySet<string>;
  noticeByMessageId: Record<string, CopyMessage>;
  /** Fill-on-first-visit: loads a conversation's layer once; revisits are instant cache hits. */
  ensureLoaded(conversationId: string | null): Promise<void>;
  checkMessage(conversationId: string, messageId: string): Promise<void>;
}

const singleFlightLoad = createSingleFlightLoader();

export const useFactcheckStore = create<FactcheckState>((set, get) => ({
  claimsByConversation: new Map(),
  checkingMessageIds: new Set(),
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

  async checkMessage(conversationId, messageId) {
    const settings = useSettingsStore.getState();
    if (!settings.networkEnabled) return setNotice(messageId, OFFLINE_NOTICE);
    if (!settings.apiConfig) return setNotice(messageId, NO_API_NOTICE);

    const { answer, question } = await resolveRoundMessages(
      conversationId,
      useChatStore.getState().messagesFor(conversationId),
      messageId,
    );
    if (answer === undefined || question === undefined) return;

    set({ checkingMessageIds: new Set([...get().checkingMessageIds, messageId]) });
    try {
      const report = await runFactCheck(
        {
          // Through lib/platform/llmConfig rather than hand-assembled: that module is where the
          // network switch is enforced, and a config built here would be a second door.
          // Without the answer-language directive on purpose — the verdict prompt states its
          // own output language, and two instructions about it contradict each other.
          llmConfig: llmConfigWithoutLanguageDirective(settings.apiConfig),
          providers: createDefaultEvidenceProviders({
            fetchImpl: tauriFetch,
            mainlandChina: settings.mainlandNetwork,
          }),
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
      console.warn("factcheck skipped:", error);
      void recordAiFailure("factcheck", error);
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
      });
    }
  },
}));

/** A search source going dark is exactly the silent degradation spec 014's debug table exists
 * for — the headless module can only report it, the host has the database. */
function recordProviderFailures(failedProviders: readonly string[]): void {
  for (const provider of failedProviders) {
    void recordAiFailure(
      "factcheck",
      `evidence provider "${provider}" could not complete a search (blocked network, non-OK response, markup drift, or no candidate page openable)`,
    );
  }
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
