/**
 * Purpose: embedding-based grading for a focus-session concept guess (spec 042 §3) — a
 * focus-scoped twin of doorStore's submitConceptGuess kept separate rather than shared
 * (CLAUDE.md #1: behavioral locality over DRY): focus sightings have no message id, and their
 * provenance is the focus station the guess was asked under, not a sibling sighting.
 * Main exports: gradeFocusGuess, recordMatchedGuess, FocusGuessResult.
 */
import type { FocusNodeRow } from "@breadcrumb/core-db";
import {
  type ConceptGuessGrade,
  conceptDirectRevealLine,
  gradeConceptGuess,
  guessFeedbackLine,
} from "@breadcrumb/plugin-explore";
import { cosineSimilarity } from "@breadcrumb/plugin-knowledge-tree";
import { useKnowledgeStore } from "../stores/knowledgeStore";
import { getRepos } from "./db";
import { embedTexts } from "./embeddings";
import { newId, nowIso } from "./time";

export interface FocusGuessResult {
  /** null = ungraded direct reveal (embedding unavailable) — no score, no record. */
  grade: ConceptGuessGrade | null;
  feedback: string;
}

/** Grades a guess against a matched knowledge node's embedding; a correct/close grade records
 * a sighting (spec 042 §3: "猜对记 sighting"). Degrades to an ungraded reveal on any failure —
 * never blocks, never penalizes. */
export async function gradeFocusGuess(input: {
  nodeId: string;
  guess: string;
  summary: string;
  conversationId: string;
  /** The focus station's own matching knowledge node, if any (spec 042 §3 origin rule). */
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
      return { grade: null, feedback: conceptDirectRevealLine(input.summary) };
    }
    const nodeVector = JSON.parse(embeddingRow.vector_json) as number[];
    const grade = gradeConceptGuess(cosineSimilarity(guessVector, nodeVector));
    if (grade === "correct" || grade === "close") {
      await repos.nodeSightings.record({
        id: newId(),
        node_id: input.nodeId,
        conversation_id: input.conversationId,
        message_id: null,
        created_at: nowIso(),
        origin_node_id: input.originNodeId,
      });
    }
    return { grade, feedback: guessFeedbackLine(grade, input.summary) };
  } catch (error) {
    console.warn("focus guess grading skipped:", error);
    return { grade: null, feedback: conceptDirectRevealLine(input.summary) };
  }
}

/** focusStore.submitGuess's tail: looks up the guessed node's summary and the current
 * station's own matching node (the origin), then grades and records — a no-op when the guessed
 * word never matched a knowledge node (spec 042 §3: no node, no scoring). */
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
