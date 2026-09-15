/**
 * Purpose: zustand store for 对着资料讲 — the source material a 学习模式 conversation is
 * currently being taught against, the visible "正在查资料" state while it is being fetched, and
 * the per-sentence labels the mechanical checks produced for each finished answer.
 *
 * Nothing here is persisted, and that is deliberate rather than pending: every label is
 * recomputed from the answer and the passages by pure functions with no model in the loop, so
 * a stored label could only ever be a stale copy of something free to recompute. The passages
 * themselves live for as long as the topic does — a follow-up on the same topic reuses them,
 * which is the whole reason the drift check exists.
 * Main exports: useGroundingStore, TopicMaterial.
 */
import type { AnswerGrounding, TopicPassage } from "@breadcrumb/feature-factcheck";
import { create } from "zustand";

export interface TopicMaterial {
  /** The question these passages were fetched for — kept for the annotation pass, which
   * counts a figure the learner supplied themselves as grounded. */
  question: string;
  passages: TopicPassage[];
  /** The one or two words these passages keep coming back to. An elliptical follow-up is
   * prefixed with them before it goes anywhere near an index — 「那它有多高」 on its own carries
   * none of the words that would find its answer. */
  entities: string[];
  /** One row per passage, for the drift check. Null when no embedder was available; the
   * next round then re-fetches rather than guessing that the topic held. */
  vectors: number[][] | null;
}

interface GroundingState {
  materialByConversation: ReadonlyMap<string, TopicMaterial>;
  /** Conversations currently fetching sources — the chat shows the wait as the work it is. */
  gatheringConversationIds: ReadonlySet<string>;
  annotationByMessage: ReadonlyMap<string, AnswerGrounding>;
  setMaterial(conversationId: string, material: TopicMaterial): void;
  /** Forgets a conversation's material — the next round fetches afresh. Called when the
   * documents the conversation is tied to change, since what was gathered under the old
   * scope is not this scope's material. */
  clearMaterial(conversationId: string): void;
  setGathering(conversationId: string, gathering: boolean): void;
  setAnnotation(messageId: string, annotation: AnswerGrounding): void;
}

export const useGroundingStore = create<GroundingState>((set, get) => ({
  materialByConversation: new Map(),
  gatheringConversationIds: new Set(),
  annotationByMessage: new Map(),

  setMaterial(conversationId, material) {
    set({
      materialByConversation: new Map(get().materialByConversation).set(conversationId, material),
    });
  },

  clearMaterial(conversationId) {
    if (!get().materialByConversation.has(conversationId)) return;
    const next = new Map(get().materialByConversation);
    next.delete(conversationId);
    set({ materialByConversation: next });
  },

  setGathering(conversationId, gathering) {
    const next = new Set(get().gatheringConversationIds);
    if (gathering) next.add(conversationId);
    else next.delete(conversationId);
    set({ gatheringConversationIds: next });
  },

  setAnnotation(messageId, annotation) {
    set({ annotationByMessage: new Map(get().annotationByMessage).set(messageId, annotation) });
  },
}));
