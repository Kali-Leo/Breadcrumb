/**
 * Purpose: zustand store for one focus (explain-word) session (spec 042 §3) — opens the
 * full-screen overlay, walks the guess gate before a picked word becomes a new station, and
 * delegates every station's DB write + stream to lib/focusSessionActions so this file stays a
 * thin set()-only orchestrator.
 * Main exports: useFocusStore, FocusGuessState.
 */
import type { FocusNodeRow } from "@breadcrumb/core-db";
import {
  buildQuestionMessages,
  buildWordExplainMessages,
  computeConceptGateProbability,
} from "@breadcrumb/plugin-explore";
import { create } from "zustand";
import { getRepos } from "../lib/db";
import { buildAncestorChain, rollConceptGate, truncateQuestionLabel } from "../lib/focusActions";
import { insertFocusNode, insertFocusSession } from "../lib/focusExplainRound";
import { recordMatchedGuess } from "../lib/focusGuessGrading";
import { createWordChild, runExplain } from "../lib/focusSessionActions";
import { appEventBus } from "./chatStore";
import { useKnowledgeStore } from "./knowledgeStore";
import { useMemoryStore } from "./memoryStore";
import { useSettingsStore } from "./settingsStore";

export interface FocusGuessState {
  word: string;
  /** The word's matching knowledge node, or null when it isn't one (ungraded reveal). */
  matchedNodeId: string | null;
}

interface FocusState {
  open: boolean;
  sessionId: string | null;
  conversationId: string | null;
  rootLabel: string;
  nodes: FocusNodeRow[];
  currentNodeId: string | null;
  streamingText: string | null;
  errorText: string | null;
  pendingGuess: FocusGuessState | null;
  guessedNodeIds: ReadonlySet<string>;
  recentConsecutiveAbandons: number;
  lastRevealAtByNode: ReadonlyMap<string, Date>;
  /** Node ids already opened as a station this session — computeFocusDoorPatches never
   * re-marks them (mirrors doorStore.openedNodeIds, but session-scoped). */
  openedDoorNodeIds: ReadonlySet<string>;
  startFromWord(conversationId: string, word: string, parentAnswerText: string): Promise<void>;
  selectWord(word: string): Promise<void>;
  submitGuess(guessText: string): Promise<void>;
  skipGuess(): void;
  askQuestion(question: string): Promise<void>;
  jumpTo(nodeId: string): void;
  exitFocus(): void;
  reopen(sessionId: string): Promise<void>;
}

const RESET_SESSION_FIELDS = {
  pendingGuess: null,
  guessedNodeIds: new Set<string>(),
  recentConsecutiveAbandons: 0,
  lastRevealAtByNode: new Map<string, Date>(),
  openedDoorNodeIds: new Set<string>(),
};

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

  async startFromWord(conversationId, word, parentAnswerText) {
    if (!useSettingsStore.getState().featureSwitches.focusExplain) return;
    const session = await insertFocusSession(conversationId, word);
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

  async submitGuess(guessText) {
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
  },

  skipGuess() {
    const pending = get().pendingGuess;
    if (pending === null) return;
    set({ pendingGuess: null, recentConsecutiveAbandons: get().recentConsecutiveAbandons + 1 });
    void createWordChild(set, get, pending.word, pending.matchedNodeId);
  },

  async askQuestion(question) {
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
    await runExplain(set, get, newNode.id, buildQuestionMessages(ancestorChain, trimmed));
  },

  jumpTo(nodeId) {
    if (get().streamingText !== null || !get().nodes.some((node) => node.id === nodeId)) return;
    set({ currentNodeId: nodeId, pendingGuess: null, errorText: null });
  },

  exitFocus() {
    const sessionId = get().sessionId;
    set({ open: false });
    if (sessionId !== null) appEventBus.emit("focus:exited", { sessionId });
  },

  async reopen(sessionId) {
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
