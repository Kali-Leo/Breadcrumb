/**
 * Purpose: focusStore's station orchestrators — creating a word or question station under the
 * current one, the stream+persist+error-banner cycle any new station runs through, and the
 * fire-and-forget LLM short-name request every new station schedules (spec 042 §2-4). Split out
 * of focusStore.ts to stay under the file-size cap; not pure (talks to the DB and the LLM), so
 * it lives here rather than in focusActions.ts.
 * Main exports: createWordChild, createQuestionChild, runExplain, scheduleFocusLabelSummary,
 * FocusSessionRuntimeState, FocusSessionSet, FocusSessionGet.
 */
import type { FocusNodeRow } from "@breadcrumb/core-db";
import {
  buildQuestionMessages,
  buildWordExplainMessages,
  type FocusPromptMessage,
  focusErrorLine,
} from "@breadcrumb/plugin-explore";
import { useSettingsStore } from "../stores/settingsStore";
import { getRepos } from "./db";
import { recordAiFailure } from "./failureLog";
import { buildAncestorChain, truncateQuestionLabel } from "./focusActions";
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
  scheduleFocusLabelSummary(set, get, newNode);
  await runExplain(set, get, newNode.id, buildWordExplainMessages(parentNode.answer_text, word));
}

/** Creates a question station under the current one and streams its answer — the ask-bar's
 * counterpart to createWordChild (spec 042 §3). */
export async function createQuestionChild(
  set: FocusSessionSet,
  get: FocusSessionGet,
  question: string,
): Promise<void> {
  const state = get();
  const trimmed = question.trim();
  if (state.sessionId === null || state.currentNodeId === null || trimmed.length === 0) return;
  const ancestorChain = buildAncestorChain(state.nodes, state.currentNodeId);
  const newNode = await insertFocusNode({
    sessionId: state.sessionId,
    parentId: state.currentNodeId,
    kind: "question",
    label: truncateQuestionLabel(trimmed),
    questionText: trimmed,
  });
  set({
    nodes: [...get().nodes, newNode],
    currentNodeId: newNode.id,
    streamingText: "",
    errorText: null,
    pendingGuess: null,
  });
  scheduleFocusLabelSummary(set, get, newNode);
  await runExplain(set, get, newNode.id, buildQuestionMessages(ancestorChain, trimmed));
}

/** Fire-and-forget short-name request for a freshly created station (spec 042 §4) — the raw
 * label stays on the map until (if ever) the model's short name lands, so this never blocks the
 * streamed explanation. A missing API config or conversation just skips the request; a failed
 * or unusable response leaves the raw label in place (summarizeFocusLabel already logs it). The
 * dynamic import keeps this side path off this module's static dependency graph. */
export function scheduleFocusLabelSummary(
  set: FocusSessionSet,
  get: FocusSessionGet,
  node: FocusNodeRow,
): void {
  const apiConfig = useSettingsStore.getState().apiConfig;
  const conversationId = get().conversationId;
  if (apiConfig === null || conversationId === null) return;
  void (async () => {
    const { summarizeFocusLabel } = await import("./focusLabelSummary");
    const shortLabel = await summarizeFocusLabel(node.label, apiConfig, conversationId);
    if (shortLabel === null) return;
    const repos = await getRepos();
    await repos.focusNodes.updateLabel(node.id, shortLabel);
    set({
      nodes: get().nodes.map((candidate) =>
        candidate.id === node.id ? { ...candidate, label: shortLabel } : candidate,
      ),
    });
  })();
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

/** Re-runs the CURRENT station's explanation after a failure or watchdog timeout (2026-08-14:
 * a stalled upstream used to leave "…" forever). Word stations rebuild from their parent's
 * answer (the root falls back to `rootParentText`, which reopened sessions no longer have —
 * an empty parent context degrades to a plain word explanation); question stations rebuild
 * from their ancestor chain. No-op while a stream is in flight or the answer already landed. */
export async function retryCurrentNode(
  set: FocusSessionSet,
  get: FocusSessionGet,
  deps: {
    rootParentText: string | null;
    buildWordMessages(parentAnswerText: string, word: string): readonly FocusPromptMessage[];
    buildQuestionMessagesFor(node: FocusNodeRow): readonly FocusPromptMessage[];
  },
): Promise<void> {
  const state = get();
  if (state.currentNodeId === null || state.streamingText !== null) return;
  const node = state.nodes.find((candidate) => candidate.id === state.currentNodeId);
  if (node === undefined || node.answer_text.length > 0) return;
  set({ streamingText: "", errorText: null });
  const messages =
    node.kind === "question"
      ? deps.buildQuestionMessagesFor(node)
      : deps.buildWordMessages(
          node.parent_id === null
            ? (deps.rootParentText ?? "")
            : (state.nodes.find((candidate) => candidate.id === node.parent_id)?.answer_text ?? ""),
          node.label,
        );
  await runExplain(set, get, node.id, messages);
}
