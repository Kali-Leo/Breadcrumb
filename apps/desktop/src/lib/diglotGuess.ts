/**
 * Purpose: guess submission for the mandatory guess card (spec 033 T8) — grades the guess
 * (zero LLM), persists the verbatim row for confusion mining, and maps grade → signal kind.
 * Side effect: DB write (diglot_word_guesses).
 * Main exports: submitDiglotGuess, guessFeedbackMessage (the wording lives in learning.json).
 */
import type { DiglotEventKind, DiglotGuessGrade } from "@breadcrumb/core-db";
import { gradeGuess, type LoadedLanguagePack } from "@breadcrumb/plugin-diglot-weave";
import { getRepos } from "./db";
import { nowIso } from "./time";

export { guessFeedbackMessage } from "@breadcrumb/plugin-diglot-weave";

/** Grades and persists one guess; returns the grade and its event kind. */
export async function submitDiglotGuess(input: {
  loaded: LoadedLanguagePack;
  lemma: string;
  originalSurface: string;
  guess: string;
  context: string;
  latencyMs: number;
}): Promise<{ grade: DiglotGuessGrade; eventKind: DiglotEventKind }> {
  const grade = gradeGuess(input.guess, input.originalSurface, input.lemma, input.loaded);
  const repos = await getRepos();
  await repos.diglot.insertGuess({
    id: crypto.randomUUID(),
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
