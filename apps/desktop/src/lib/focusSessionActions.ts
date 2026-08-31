/**
 * Purpose: focusStore's station orchestrators — creating a word or question station under the
 * current one (each runs the runExplain stream cycle from focusExplainStream.ts), the retry
 * path, and the fire-and-forget LLM short-name request every new station schedules (spec 042
 * §2-4). Split out of focusStore.ts to stay under the file-size cap; not pure (talks to the DB
 * and the LLM), so it lives here rather than in focusActions.ts.
 * Main exports: createWordChild, createQuestionChild, submitPendingGuess, skipPendingGuess,
 * retryCurrentNode, scheduleFocusLabelSummary (re-exports runExplain, stopExplainStream and
 * the session types).
 */
import type { FocusNodeRow } from "@breadcrumb/core-db";
import {
  buildQuestionMessages,
  buildWordExplainMessages,
  type FocusPromptMessage,
  shortenStationLabel,
} from "@breadcrumb/plugin-explore";
import { getRepos } from "./db";
import { buildAncestorChain, truncateQuestionLabel } from "./focusActions";
import { insertFocusNode } from "./focusExplainRound";
import {
  type FocusSessionGet,
  type FocusSessionRuntimeState,
  type FocusSessionSet,
  runExplain,
  stopExplainStream,
} from "./focusExplainStream";
import { recordMatchedGuess } from "./focusGuessGrading";

export type { FocusSessionGet, FocusSessionRuntimeState, FocusSessionSet };
export { runExplain, stopExplainStream };

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

/** Grades and records a submitted guess, then opens the guessed word's station — the guess
 * gate's accept path (spec 042 §3). */
export async function submitPendingGuess(
  set: FocusSessionSet,
  get: FocusSessionGet,
  guessText: string,
): Promise<void> {
  const state = get();
  const pending = state.pendingGuess;
  const trimmed = guessText.trim();
  if (pending === null || trimmed.length === 0 || state.conversationId === null) return;
  set({ pendingGuess: null, recentConsecutiveAbandons: 0 });
  if (pending.matchedNodeId !== null) {
    set({ guessedNodeIds: new Set(state.guessedNodeIds).add(pending.matchedNodeId) });
  }
  await recordMatchedGuess({
    pending,
    currentNode: state.nodes.find((node) => node.id === state.currentNodeId),
    conversationId: state.conversationId,
    guessText: trimmed,
  });
  await createWordChild(set, get, pending.word, pending.matchedNodeId);
}

/** The guess gate's skip path — counted as an abandon, then the station opens anyway. */
export function skipPendingGuess(set: FocusSessionSet, get: FocusSessionGet): void {
  const pending = get().pendingGuess;
  if (pending === null) return;
  set({ pendingGuess: null, recentConsecutiveAbandons: get().recentConsecutiveAbandons + 1 });
  void createWordChild(set, get, pending.word, pending.matchedNodeId);
}

/** Shortens a freshly created station's label so the map stays readable (spec 042 §4).
 *
 * This used to be an LLM call per long label. It is now arithmetic on the label's own text:
 * free, instant, offline, and incapable of inventing a name for a station. The shortener
 * declines rather than cutting a word in half, and every path falls back to the raw label —
 * so the worst case is the map ellipsising a long name, which is what it did before anyway. */
export function scheduleFocusLabelSummary(
  set: FocusSessionSet,
  get: FocusSessionGet,
  node: FocusNodeRow,
): void {
  const shortLabel = shortenStationLabel(node.label);
  if (shortLabel === null) return;
  void (async () => {
    const repos = await getRepos();
    await repos.focusNodes.updateLabel(node.id, shortLabel);
    set({
      nodes: get().nodes.map((candidate) =>
        candidate.id === node.id ? { ...candidate, label: shortLabel } : candidate,
      ),
    });
  })();
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
