/**
 * Purpose: zustand store for explore doors (spec 039 §2.1-2.2) — per-message door candidates
 * (single-flight, mirrors diglotStore.ensureWoven), session-scoped door/guess bookkeeping,
 * the concept guess-gate decision, and guess submission (local embedding grading, degrading
 * to a plain reveal on any failure — never scored, never penalized).
 * Main exports: useDoorStore, ConceptGuessResult.
 */
import {
  type ConceptGuessGrade,
  computeConceptGateProbability,
  conceptDirectRevealLine,
  type DoorCandidate,
  gradeConceptGuess,
  guessFeedbackLine,
} from "@breadcrumb/plugin-explore";
import { cosineSimilarity } from "@breadcrumb/plugin-knowledge-tree";
import { create } from "zustand";
import { getRepos } from "../lib/db";
import { embedTexts } from "../lib/embeddings";
import { newId, nowIso } from "../lib/time";
import { useKnowledgeStore } from "./knowledgeStore";
import { useMemoryStore } from "./memoryStore";

export interface ConceptGuessResult {
  /** null = ungraded direct reveal (embedding unavailable) — no score, no record. */
  grade: ConceptGuessGrade | null;
  feedback: string;
}

interface DoorState {
  doorsByMessage: Map<string, DoorCandidate[]>;
  /** Node ids already opened as doors this conversation — pickDoors never repeats them. */
  openedNodeIds: Set<string>;
  lastRevealAtByNode: Map<string, Date>;
  /** Node ids with at least one concept guess this conversation — an explicit signal. */
  guessedNodeIds: Set<string>;
  recentConsecutiveAbandons: number;
  /** Session-level throttle: at most one sighting write per node from guess grading. */
  sightingRecordedNodeIds: Set<string>;
  /** Cached once per conversation from mastery_claims — also an explicit signal. */
  claimedNodeIds: Set<string> | null;
  ensureDoors(messageId: string, displaySource: string): Promise<void>;
  shouldAskGuess(nodeId: string): boolean;
  noteReveal(nodeId: string): void;
  noteGuessOutcome(abandoned: boolean): void;
  markOpened(nodeId: string): void;
  submitConceptGuess(
    nodeId: string,
    guess: string,
    conversationId: string,
    messageId: string,
  ): Promise<ConceptGuessResult>;
  /** Clears every session-scoped field — call when the active conversation changes. */
  resetForConversation(): void;
}

export const useDoorStore = create<DoorState>((set, get) => ({
  doorsByMessage: new Map(),
  openedNodeIds: new Set(),
  lastRevealAtByNode: new Map(),
  guessedNodeIds: new Set(),
  recentConsecutiveAbandons: 0,
  sightingRecordedNodeIds: new Set(),
  claimedNodeIds: null,

  async ensureDoors(messageId, displaySource) {
    if (get().doorsByMessage.has(messageId)) return;
    get().doorsByMessage.set(messageId, []); // reserve to keep the pick single-flight
    if (get().claimedNodeIds === null) {
      const repos = await getRepos();
      const claims = await repos.masteryClaims.listAll();
      set({ claimedNodeIds: new Set(claims.map((claim) => claim.node_id)) });
    }
    const { computeDoorPatches } = await import("../lib/conceptDoors");
    const doors = await computeDoorPatches(messageId, displaySource);
    set({ doorsByMessage: new Map(get().doorsByMessage).set(messageId, doors) });
  },

  shouldAskGuess(nodeId) {
    const state = get();
    const probability = computeConceptGateProbability({
      retention: useMemoryStore.getState().retentionByNode.get(nodeId) ?? null,
      hasExplicitSignal:
        state.guessedNodeIds.has(nodeId) || (state.claimedNodeIds?.has(nodeId) ?? false),
      lastRevealAt: state.lastRevealAtByNode.get(nodeId) ?? null,
      now: new Date(),
      recentConsecutiveAbandons: state.recentConsecutiveAbandons,
    });
    return Math.random() < probability;
  },

  noteReveal(nodeId) {
    set({ lastRevealAtByNode: new Map(get().lastRevealAtByNode).set(nodeId, new Date()) });
  },

  noteGuessOutcome(abandoned) {
    set({ recentConsecutiveAbandons: abandoned ? get().recentConsecutiveAbandons + 1 : 0 });
  },

  markOpened(nodeId) {
    set({ openedNodeIds: new Set(get().openedNodeIds).add(nodeId) });
  },

  async submitConceptGuess(nodeId, guess, conversationId, messageId) {
    set({ guessedNodeIds: new Set(get().guessedNodeIds).add(nodeId) });
    get().noteGuessOutcome(false);
    const node = useKnowledgeStore.getState().nodes.find((candidate) => candidate.id === nodeId);
    const summary = node?.summary ?? "";
    try {
      const repos = await getRepos();
      const [guessVectors, embeddingRow] = await Promise.all([
        embedTexts([guess]),
        repos.nodeEmbeddings.getByNode(nodeId),
      ]);
      const guessVector = guessVectors?.[0] ?? null;
      if (guessVector === null || embeddingRow === null) {
        return { grade: null, feedback: conceptDirectRevealLine(summary) };
      }
      const nodeVector = JSON.parse(embeddingRow.vector_json) as number[];
      const grade = gradeConceptGuess(cosineSimilarity(guessVector, nodeVector));
      if (
        (grade === "correct" || grade === "close") &&
        !get().sightingRecordedNodeIds.has(nodeId)
      ) {
        await repos.nodeSightings.record({
          id: newId(),
          node_id: nodeId,
          conversation_id: conversationId,
          message_id: messageId,
          created_at: nowIso(),
        });
        set({ sightingRecordedNodeIds: new Set(get().sightingRecordedNodeIds).add(nodeId) });
        void useMemoryStore.getState().refresh();
      }
      return { grade, feedback: guessFeedbackLine(grade, summary) };
    } catch (error) {
      console.warn("concept guess grading skipped:", error);
      return { grade: null, feedback: conceptDirectRevealLine(summary) };
    }
  },

  resetForConversation() {
    set({
      doorsByMessage: new Map(),
      openedNodeIds: new Set(),
      lastRevealAtByNode: new Map(),
      guessedNodeIds: new Set(),
      recentConsecutiveAbandons: 0,
      sightingRecordedNodeIds: new Set(),
    });
  },
}));
