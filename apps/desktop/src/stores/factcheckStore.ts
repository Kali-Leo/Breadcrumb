/**
 * Purpose: zustand store for fact-check runs — manual per-message checking through the
 * plugin-factcheck pipeline, persistence, metering (purpose "factcheck"), gentle notices.
 * Main exports: useFactcheckStore, DisplayClaim.
 */
import type { FactcheckClaimRow } from "@breadcrumb/core-db";
import {
  createDefaultEvidenceProviders,
  type EvidenceItem,
  runFactCheck,
} from "@breadcrumb/plugin-factcheck";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { create } from "zustand";
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
  /** Checked claims per assistant message (empty array = checked, nothing to verify). */
  claimsByMessageId: Record<string, DisplayClaim[]>;
  checkingMessageIds: ReadonlySet<string>;
  noticeByMessageId: Record<string, string>;
  loadForConversation(conversationId: string | null): Promise<void>;
  checkMessage(messageId: string): Promise<void>;
}

export const useFactcheckStore = create<FactcheckState>((set, get) => ({
  claimsByMessageId: {},
  checkingMessageIds: new Set(),
  noticeByMessageId: {},

  async loadForConversation(conversationId) {
    if (conversationId === null) {
      set({ claimsByMessageId: {}, noticeByMessageId: {} });
      return;
    }
    const repos = await getRepos();
    const runs = await repos.factcheck.listRunsByConversation(conversationId);
    const claimsByMessageId: Record<string, DisplayClaim[]> = {};
    for (const run of runs) {
      // Oldest-first iteration: the newest run per message naturally wins.
      const rows = await repos.factcheck.listClaimsByRun(run.id);
      claimsByMessageId[run.message_id] = rows.map(rowToDisplayClaim);
    }
    set({ claimsByMessageId, noticeByMessageId: {} });
  },

  async checkMessage(messageId) {
    const settings = useSettingsStore.getState();
    if (!settings.networkEnabled) return setNotice(messageId, OFFLINE_NOTICE);
    if (!settings.apiConfig) return setNotice(messageId, NO_API_NOTICE);

    const chatMessages = useChatStore.getState().messages;
    const answerIndex = chatMessages.findIndex((message) => message.id === messageId);
    const answer = chatMessages[answerIndex];
    if (answer?.role !== "assistant") return;
    const question = chatMessages
      .slice(0, answerIndex)
      .reverse()
      .find((message) => message.role === "user");
    if (question === undefined) return;

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
        conversationId: answer.conversation_id,
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
          conversation_id: answer.conversation_id,
          created_at: createdAt,
        },
        claimRows,
      );
      appEventBus.emit("factcheck:finished", {
        conversationId: answer.conversation_id,
        messageId,
        runId,
      });

      set({
        claimsByMessageId: {
          ...get().claimsByMessageId,
          [messageId]: claimRows.map(rowToDisplayClaim),
        },
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
