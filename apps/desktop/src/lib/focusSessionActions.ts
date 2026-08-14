/**
 * Purpose: focusStore's two DB+stream orchestrators — creating a word station under the
 * current one, and the stream+persist+error-banner cycle any new station runs through (spec
 * 042 §2-3). Split out of focusStore.ts to stay under the file-size cap; not pure (talks to the
 * DB and the LLM), so it lives here rather than in focusActions.ts.
 * Main exports: createWordChild, runExplain, FocusSessionRuntimeState, FocusSessionSet,
 * FocusSessionGet.
 */
import type { FocusNodeRow } from "@breadcrumb/core-db";
import {
  buildWordExplainMessages,
  type FocusPromptMessage,
  focusErrorLine,
} from "@breadcrumb/plugin-explore";
import { useSettingsStore } from "../stores/settingsStore";
import { recordAiFailure } from "./failureLog";
import { insertFocusNode, streamFocusNodeAnswer } from "./focusExplainRound";

/** The slice of focusStore's state these orchestrators read and write — narrower than the
 * store's full interface so this file doesn't import focusStore.ts (no import cycle). */
export interface FocusSessionRuntimeState {
  sessionId: string | null;
  conversationId: string | null;
  nodes: FocusNodeRow[];
  currentNodeId: string | null;
  streamingText: string | null;
  errorText: string | null;
  pendingGuess: { word: string; matchedNodeId: string | null } | null;
  lastRevealAtByNode: ReadonlyMap<string, Date>;
  openedDoorNodeIds: ReadonlySet<string>;
}

export type FocusSessionGet = () => FocusSessionRuntimeState;
export type FocusSessionSet = (partial: Partial<FocusSessionRuntimeState>) => void;

/** Creates a child word station under the current one and streams its explanation — shared by
 * the no-gate path, a submitted guess, and a skipped guess (spec 042 §3). */
export async function createWordChild(
  set: FocusSessionSet,
  get: FocusSessionGet,
  word: string,
  matchedNodeId: string | null,
): Promise<void> {
  const state = get();
  if (state.sessionId === null || state.currentNodeId === null) return;
  const parentNode = state.nodes.find((node) => node.id === state.currentNodeId);
  if (parentNode === undefined) return;
  const newNode = await insertFocusNode({
    sessionId: state.sessionId,
    parentId: state.currentNodeId,
    kind: "word",
    label: word,
    questionText: null,
  });
  set({
    nodes: [...get().nodes, newNode],
    currentNodeId: newNode.id,
    streamingText: "",
    errorText: null,
    pendingGuess: null,
    lastRevealAtByNode:
      matchedNodeId === null
        ? get().lastRevealAtByNode
        : new Map(get().lastRevealAtByNode).set(matchedNodeId, new Date()),
    openedDoorNodeIds:
      matchedNodeId === null
        ? get().openedDoorNodeIds
        : new Set(get().openedDoorNodeIds).add(matchedNodeId),
  });
  await runExplain(set, get, newNode.id, buildWordExplainMessages(parentNode.answer_text, word));
}

/** Streams and persists one station's answer, degrading to a plain error banner on failure
 * (product principle 1) — shared by every action that opens a new station. */
export async function runExplain(
  set: FocusSessionSet,
  get: FocusSessionGet,
  nodeId: string,
  messages: readonly FocusPromptMessage[],
): Promise<void> {
  const state = get();
  const apiConfig = useSettingsStore.getState().apiConfig;
  if (apiConfig === null || state.conversationId === null) {
    set({ streamingText: null, errorText: focusErrorLine("还没有配置 API") });
    return;
  }
  try {
    const content = await streamFocusNodeAnswer({
      nodeId,
      messages,
      apiConfig,
      conversationId: state.conversationId,
      onDelta: (delta) => set({ streamingText: `${get().streamingText ?? ""}${delta}` }),
    });
    set({
      nodes: get().nodes.map((node) =>
        node.id === nodeId ? { ...node, answer_text: content } : node,
      ),
      streamingText: null,
    });
  } catch (error) {
    await recordAiFailure("focus-explain", error);
    set({
      streamingText: null,
      errorText: focusErrorLine(error instanceof Error ? error.message : String(error)),
    });
  }
}
