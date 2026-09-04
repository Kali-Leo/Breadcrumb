/**
 * Purpose: guess submission for the mandatory guess card (spec 033 T8) — grades the guess
 * (zero LLM), persists the verbatim row for confusion mining, and maps grade → signal kind.
 * Side effect: DB write (diglot_word_guesses).
 * Main exports: submitDiglotGuess, guessFeedbackMessage (the wording lives in learning.json).
 */
import type { DiglotEventKind, DiglotGuessGrade } from "@breadcrumb/core-db";
import {
  cosineSimilarity,
  gradeGuess,
  type LoadedLanguagePack,
} from "@breadcrumb/feature-diglot-weave";
import { getRepos } from "../platform/db";
import { embedTexts } from "../platform/embeddings";
import { newId, nowIso } from "../platform/time";

export { guessFeedbackMessage } from "@breadcrumb/feature-diglot-weave";

/** Cosine similarity between the guess and the original word, from the local embedding
 * model — the only evidence that grades a guess "close" (character overlap called Chinese
 * antonyms close, since they share a morpheme). null whenever embeddings are unavailable, in
 * which case grading degrades to correct-or-wrong. */
async function guessSimilarity(guess: string, originalSurface: string): Promise<number | null> {
  const vectors = await embedTexts([guess.trim(), originalSurface]);
  const [guessVector, originalVector] = vectors ?? [];
  if (guessVector === undefined || originalVector === undefined) return null;
  return cosineSimilarity(guessVector, originalVector);
}

/** Grades and persists one guess; returns the grade and its event kind. */
export async function submitDiglotGuess(input: {
  loaded: LoadedLanguagePack;
  lemma: string;
  originalSurface: string;
  guess: string;
  context: string;
  latencyMs: number;
}): Promise<{ grade: DiglotGuessGrade; eventKind: DiglotEventKind }> {
  const grade = gradeGuess(input.guess, input.originalSurface, input.lemma, input.loaded, {
    similarity: await guessSimilarity(input.guess, input.originalSurface),
  });
  const repos = await getRepos();
  await repos.diglot.insertGuess({
    id: newId(),
    lemma: input.lemma,
    pair: input.loaded.pack.id,
    guess: input.guess,
    grade,
    context: input.context,
    latency_ms: input.latencyMs,
    created_at: nowIso(),
  });
  const eventKind: DiglotEventKind =
    grade === "correct" ? "guess_correct" : grade === "close" ? "guess_close" : "guess_wrong";
  return { grade, eventKind };
}
