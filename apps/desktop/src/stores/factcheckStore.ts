/**
 * Purpose: zustand store for fact-check runs — manual per-message checking through the
 * plugin-factcheck pipeline, persistence, metering (purpose "factcheck"), gentle notices.
 * Claims are layered per conversation, filled on first visit and never wiped on switch;
 * layers accumulate for every conversation visited this app session (the Discord tradeoff).
 * Main exports: useFactcheckStore, DisplayClaim.
 */
import type { FactcheckClaimRow, MessageRow } from "@breadcrumb/core-db";
import {
  createDefaultEvidenceProviders,
  type EvidenceItem,
  runFactCheck,
} from "@breadcrumb/plugin-factcheck";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { create } from "zustand";
import { createSingleFlightLoader, setConversationLayer } from "../lib/conversationLayers";
import { getRepos } from "../lib/db";
import { recordAiFailure } from "../lib/failureLog";
import { recordMeteredCall } from "../lib/metering";
import { newId, nowIso } from "../lib/time";
import { appEventBus, useChatStore } from "./chatStore";
import { useSettingsStore } from "./settingsStore";

export interface DisplayClaim {
  text: string;
  relationship: string;
  reasoning: string;
  evidence: EvidenceItem[];
}

const OFFLINE_NOTICE = "网络总开关是关着的——打开它，我才能出门查资料。";
const NO_API_NOTICE = "先在设置里配好 AI 服务，我才能帮你查证。";
const FAILED_NOTICE = "这次核查没能完成（网络波动），稍后可以再试一次。";

interface FactcheckState {
  /** Checked claims per conversation, then per assistant message (an empty claim array =
   * checked, nothing to verify). Source of truth — badges read their conversation's layer. */
  claimsByConversation: ReadonlyMap<string, ReadonlyMap<string, DisplayClaim[]>>;
  checkingMessageIds: ReadonlySet<string>;
  noticeByMessageId: Record<string, string>;
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
      const repos = await getRepos();
      const runs = await repos.factcheck.listRunsByConversation(conversationId);
      const layer = new Map<string, DisplayClaim[]>();
      for (const run of runs) {
        // Oldest-first iteration: the newest run per message naturally wins.
        const rows = await repos.factcheck.listClaimsByRun(run.id);
        layer.set(run.message_id, rows.map(rowToDisplayClaim));
      }
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

    const { answer, question } = await resolveRoundMessages(conversationId, messageId);
    if (answer === undefined || question === undefined) return;

    set({ checkingMessageIds: new Set([...get().checkingMessageIds, messageId]) });
    try {
      const fetchImpl = tauriFetch;
      const report = await runFactCheck(
        {
          llmConfig: { ...settings.apiConfig, fetchImpl },
          providers: createDefaultEvidenceProviders({
            fetchImpl,
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

      const runId = newId();
      const createdAt = nowIso();
      const claimRows: FactcheckClaimRow[] = report.claims.map((claim) => ({
        id: newId(),
        run_id: runId,
        claim_text: claim.text,
        relationship: claim.relationship,
        reasoning: claim.reasoning,
        evidence_json: JSON.stringify(claim.evidence),
        created_at: createdAt,
      }));
      const repos = await getRepos();
      await repos.factcheck.recordRun(
        {
          id: runId,
          message_id: messageId,
          conversation_id: conversationId,
          created_at: createdAt,
        },
        claimRows,
      );
      appEventBus.emit("factcheck:finished", { conversationId, messageId, runId });

      // The result lands in ITS conversation's layer — correct even if the user switched away.
      const layer = new Map(get().claimsByConversation.get(conversationId) ?? []);
      layer.set(messageId, claimRows.map(rowToDisplayClaim));
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
      setNotice(messageId, FAILED_NOTICE);
    } finally {
      set({
        checkingMessageIds: new Set([...get().checkingMessageIds].filter((id) => id !== messageId)),
      });
    }
  },
}));

/** Resolves the checked assistant message and its preceding user question from the message's
 * OWN conversation (never the active mirror); falls back to the DB when the chat session
 * isn't loaded (a badge can outlive its session in a popup or after a reload race). */
async function resolveRoundMessages(
  conversationId: string,
  messageId: string,
): Promise<{ answer: MessageRow | undefined; question: MessageRow | undefined }> {
  let chatMessages = useChatStore.getState().messagesFor(conversationId);
  if (chatMessages.length === 0) {
    const repos = await getRepos();
    chatMessages = await repos.messages.listByConversation(conversationId);
  }
  const answerIndex = chatMessages.findIndex((message) => message.id === messageId);
  const answer = chatMessages[answerIndex];
  if (answer?.role !== "assistant") return { answer: undefined, question: undefined };
  const question = chatMessages
    .slice(0, answerIndex)
    .reverse()
    .find((message) => message.role === "user");
  return { answer, question };
}

function rowToDisplayClaim(row: FactcheckClaimRow): DisplayClaim {
  return {
    text: row.claim_text,
    relationship: row.relationship,
    reasoning: row.reasoning,
    evidence: JSON.parse(row.evidence_json) as EvidenceItem[],
  };
}

function setNotice(messageId: string, text: string): void {
  useFactcheckStore.setState((state) => ({
    noticeByMessageId: { ...state.noticeByMessageId, [messageId]: text },
  }));
}

function withoutKey(record: Record<string, string>, key: string): Record<string, string> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}
