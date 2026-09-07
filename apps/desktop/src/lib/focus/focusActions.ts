/**
 * Purpose: pure helpers and shared types behind focusStore — the ancestor-answer
 * chain a question node's prompt quotes, the question node's short station label, the guess-gate
 * dice roll, and the FocusGuessState shape (kept here rather than in focusStore.ts to stay under
 * the file-size cap) — unit-tested, so focusStore.ts stays a thin orchestrator.
 * Main exports: buildAncestorChain, truncateQuestionLabel, rollConceptGate, FocusGuessState.
 */
import type { FocusNodeRow } from "@breadcrumb/core-db";
import { truncate } from "../platform/truncateText";

export interface FocusGuessState {
  word: string;
  /** The word's matching knowledge node, or null when it isn't one (ungraded reveal). */
  matchedNodeId: string | null;
}

/** A question node's station label is the free-text question, truncated. */
const QUESTION_LABEL_MAX_CHARS = 12;

/** Root-to-parent chain of {label, answerText}, in order — buildQuestionMessages' context
 * ("根到父的祖先链各节点全文"). parentId null (asking from the root) yields
 * an empty chain, which buildQuestionMessages renders as just the question. */
export function buildAncestorChain(
  nodes: readonly FocusNodeRow[],
  parentId: string | null,
): { label: string; answerText: string }[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const chain: { label: string; answerText: string }[] = [];
  let cursor = parentId;
  while (cursor !== null) {
    const node = byId.get(cursor);
    if (node === undefined) break;
    chain.unshift({ label: node.label, answerText: node.answer_text });
    cursor = node.parent_id;
  }
  return chain;
}

/** Truncates a free-text question into a station label. */
export function truncateQuestionLabel(question: string): string {
  return truncate(question.trim(), QUESTION_LABEL_MAX_CHARS);
}

/** The guess-gate dice roll: true = open with a guess card instead of jumping
 * straight to the explanation. `random` is injectable so callers can test both outcomes. */
export function rollConceptGate(probability: number, random: () => number = Math.random): boolean {
  return random() < probability;
}
