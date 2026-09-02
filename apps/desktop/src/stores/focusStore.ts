/**
 * Purpose: zustand store for one focus (explain-word) session (spec 042 §3) — opens the
 * full-screen overlay, walks the guess gate before a picked word becomes a new station, and
 * delegates every station's DB write + stream to lib/focus/focusSessionActions so this file stays a
 * thin set()-only orchestrator.
 * Main exports: useFocusStore.
 */
import {
  buildQuestionMessages,
  buildWordExplainMessages,
  computeConceptGateProbability,
} from "@breadcrumb/feature-explore";
import { create } from "zustand";
import { buildAncestorChain, rollConceptGate } from "../lib/focus/focusActions";
import { insertFocusNode, insertFocusSession } from "../lib/focus/focusExplainRound";
import {
  createQuestionChild,
  createWordChild,
  retryCurrentNode,
  runExplain,
  skipPendingGuess,
  stopExplainStream,
  submitPendingGuess,
} from "../lib/focus/focusSessionActions";
import { type FocusState, RESET_SESSION_FIELDS } from "../lib/focus/focusStoreState";
import { getRepos } from "../lib/platform/db";
import { appEventBus } from "./chatStore";
import { useKnowledgeStore } from "./knowledgeStore";
import { useMemoryStore } from "./memoryStore";
import { useSettingsStore } from "./settingsStore";

/** The root station's parent context (the chat reply it was selected from) — kept only for
 * in-session retries; reopened sessions fall back to a plain word explanation. */
let rootParentText: string | null = null;

export const useFocusStore = create<FocusState>((set, get) => ({
  open: false,
  sessionId: null,
  conversationId: null,
  rootLabel: "",
  nodes: [],
  currentNodeId: null,
  streamingText: null,
  errorText: null,
  ...RESET_SESSION_FIELDS,

  async startFromWord(conversationId, word, parentAnswerText, sourceMessageId) {
    if (!useSettingsStore.getState().featureSwitches.focusExplain) return;
    rootParentText = parentAnswerText;
    const session = await insertFocusSession(conversationId, word, sourceMessageId);
    const rootNode = await insertFocusNode({
      sessionId: session.id,
      parentId: null,
      kind: "word",
      label: word,
      questionText: null,
    });
    set({
      open: true,
      sessionId: session.id,
      conversationId,
      rootLabel: word,
      nodes: [rootNode],
      currentNodeId: rootNode.id,
      streamingText: "",
      errorText: null,
      ...RESET_SESSION_FIELDS,
    });
    await runExplain(set, get, rootNode.id, buildWordExplainMessages(parentAnswerText, word));
  },

  async selectWord(word) {
    const state = get();
    if (!state.open || state.currentNodeId === null || state.streamingText !== null) return;
    const matchedNode = useKnowledgeStore.getState().nodes.find((node) => node.label === word);
    const nodeId = matchedNode?.id ?? null;
    const probability = computeConceptGateProbability({
      retention:
        nodeId === null ? null : (useMemoryStore.getState().retentionByNode.get(nodeId) ?? null),
      hasExplicitSignal: nodeId !== null && state.guessedNodeIds.has(nodeId),
      lastRevealAt: nodeId === null ? null : (state.lastRevealAtByNode.get(nodeId) ?? null),
      now: new Date(),
      recentConsecutiveAbandons: state.recentConsecutiveAbandons,
    });
    if (rollConceptGate(probability)) {
      set({ pendingGuess: { word, matchedNodeId: nodeId } });
      return;
    }
    await createWordChild(set, get, word, nodeId);
  },

  submitGuess: (guessText) => submitPendingGuess(set, get, guessText),

  skipGuess() {
    skipPendingGuess(set, get);
  },

  async askQuestion(question) {
    // Single-buffer guard (mirrors selectWord/jumpTo): asking during a stream would
    // interleave two runs into one buffer. The ask bar drops the submit, keeping the text.
    if (get().streamingText !== null) return;
    await createQuestionChild(set, get, question);
  },

  stopStreaming() {
    stopExplainStream(set, get);
  },

  jumpTo(nodeId) {
    if (get().streamingText !== null || !get().nodes.some((node) => node.id === nodeId)) return;
    set({ currentNodeId: nodeId, pendingGuess: null, errorText: null });
  },

  exitFocus() {
    const sessionId = get().sessionId;
    // sessionId flips to null so any in-flight explain run recognises itself as stale.
    set({ open: false, sessionId: null, streamingText: null, errorText: null });
    if (sessionId !== null) appEventBus.emit("focus:exited", { sessionId });
  },

  async retryCurrent() {
    await retryCurrentNode(set, get, {
      rootParentText,
      buildWordMessages: buildWordExplainMessages,
      buildQuestionMessagesFor: (node) =>
        buildQuestionMessages(
          buildAncestorChain(get().nodes, node.parent_id),
          node.question_text ?? node.label,
        ),
    });
  },

  async reopen(sessionId) {
    rootParentText = null;
    const repos = await getRepos();
    const session = await repos.focusSessions.getById(sessionId);
    if (session === null) return;
    const nodes = await repos.focusNodes.listBySession(sessionId);
    set({
      open: true,
      sessionId: session.id,
      conversationId: session.conversation_id,
      rootLabel: session.root_label,
      nodes,
      currentNodeId: nodes.at(-1)?.id ?? null,
      streamingText: null,
      errorText: null,
      ...RESET_SESSION_FIELDS,
    });
  },
}));
