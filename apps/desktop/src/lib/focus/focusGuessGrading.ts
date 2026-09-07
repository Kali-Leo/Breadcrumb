/**
 * Purpose: embedding-based grading for a focus-session concept guess — the only
 * concept guess left in the app. What
 * stays true of the sightings written here: they have no message id, and their provenance is
 * the focus station the guess was asked under, not a sibling sighting.
 * Main exports: gradeFocusGuess, recordMatchedGuess, FocusGuessResult.
 */
import type { FocusNodeRow, NodeSightingGrade } from "@breadcrumb/core-db";
import { parseVectorColumn } from "@breadcrumb/core-db";
import type { CopyMessage } from "@breadcrumb/core-i18n";
import {
  type ConceptGuessGrade,
  conceptDirectRevealMessage,
  gradeConceptGuess,
  guessFeedbackMessage,
} from "@breadcrumb/feature-explore";
import { cosineSimilarity } from "@breadcrumb/feature-knowledge-tree";
import { useKnowledgeStore } from "../../stores/knowledgeStore";
import { getRepos } from "../platform/db";
import { embedTexts } from "../platform/embeddings";
import { degradeSilently } from "../platform/failureLog";
import { newId, nowIso } from "../platform/time";

/** A concept guess is the only place in the app where the learner is asked to produce a
 * concept from memory and the answer is graded — i.e. the one real retrieval signal there is.
 * All three outcomes are recorded, wrong included. The wrong branch is the first negative
 * evidence in the system;
 * it only moves the internal FSRS estimate down, and changes nothing the learner is told
 * (guessFeedbackMessage is untouched). */
const SIGHTING_GRADE_BY_GUESS: Record<ConceptGuessGrade, NodeSightingGrade> = {
  correct: "easy",
  close: "hard",
  wrong: "again",
};

export interface FocusGuessResult {
  /** null = ungraded direct reveal (embedding unavailable) — no score, no record. */
  grade: ConceptGuessGrade | null;
  feedback: CopyMessage;
}

/** Grades a guess against a matched knowledge node's embedding and records the outcome as one
 * graded sighting ("猜对记 sighting", widened to all three outcomes). Degrades to an ungraded
 * reveal on any failure — never blocks, and the
 * learner-facing wording never penalizes. */
export async function gradeFocusGuess(input: {
  nodeId: string;
  guess: string;
  summary: string;
  conversationId: string;
  /** The focus station's own matching knowledge node, if any (origin rule). */
  originNodeId: string | null;
}): Promise<FocusGuessResult> {
  try {
    const repos = await getRepos();
    const [guessVectors, embeddingRow] = await Promise.all([
      embedTexts([input.guess]),
      repos.nodeEmbeddings.getByNode(input.nodeId),
    ]);
    const guessVector = guessVectors?.[0] ?? null;
    if (guessVector === null || embeddingRow === null) {
      return { grade: null, feedback: conceptDirectRevealMessage(input.summary) };
    }
    const nodeVector = parseVectorColumn(embeddingRow.vector_json);
    if (nodeVector === null || nodeVector.length !== guessVector.length) {
      return { grade: null, feedback: conceptDirectRevealMessage(input.summary) };
    }
    const grade = gradeConceptGuess(cosineSimilarity(guessVector, nodeVector));
    await repos.nodeSightings.record({
      id: newId(),
      node_id: input.nodeId,
      conversation_id: input.conversationId,
      message_id: null,
      created_at: nowIso(),
      origin_node_id: input.originNodeId,
      grade: SIGHTING_GRADE_BY_GUESS[grade],
    });
    return { grade, feedback: guessFeedbackMessage(grade, input.summary) };
  } catch (error) {
    void degradeSilently("focus-guess", error);
    return { grade: null, feedback: conceptDirectRevealMessage(input.summary) };
  }
}

/** focusStore.submitGuess's tail: looks up the guessed node's summary and the current
 * station's own matching node (the origin), then grades and records — a no-op when the guessed
 * word never matched a knowledge node (no node, no scoring). */
export async function recordMatchedGuess(input: {
  pending: { word: string; matchedNodeId: string | null };
  currentNode: FocusNodeRow | undefined;
  conversationId: string;
  guessText: string;
}): Promise<void> {
  if (input.pending.matchedNodeId === null) return;
  const nodes = useKnowledgeStore.getState().nodes;
  const guessedNode = nodes.find((node) => node.id === input.pending.matchedNodeId);
  const originNode = input.currentNode
    ? nodes.find((node) => node.label === input.currentNode?.label)
    : undefined;
  await gradeFocusGuess({
    nodeId: input.pending.matchedNodeId,
    guess: input.guessText,
    summary: guessedNode?.summary ?? "",
    conversationId: input.conversationId,
    originNodeId: originNode?.id ?? null,
  });
}
