/**
 * Purpose: zero-LLM guess grading (spec 033) — the user's guess at a woven word's meaning
 * is graded against the original word, its dictionary synonyms, and a character-overlap
 * closeness measure. Pure and deterministic.
 * Main exports: gradeGuess.
 */
import type { DiglotGuessGrade } from "@breadcrumb/core-db";
import type { LoadedLanguagePack } from "./packSchema";

/** Lowercases, trims and strips surrounding punctuation/whitespace from a guess. */
function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, "");
}

/** Levenshtein distance — small inputs only (guesses are single words). */
function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const distance = Array.from({ length: rows }, (_, row) => {
    const line = new Array<number>(cols).fill(0);
    line[0] = row;
    return line;
  });
  for (let col = 0; col < cols; col += 1) {
    const firstLine = distance[0];
    if (firstLine !== undefined) firstLine[col] = col;
  }
  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const substitutionCost = a[row - 1] === b[col - 1] ? 0 : 1;
      const line = distance[row];
      const previousLine = distance[row - 1];
      if (line === undefined || previousLine === undefined) continue;
      line[col] = Math.min(
        (line[col - 1] ?? 0) + 1,
        (previousLine[col] ?? 0) + 1,
        (previousLine[col - 1] ?? 0) + substitutionCost,
      );
    }
  }
  return distance[rows - 1]?.[cols - 1] ?? Math.max(a.length, b.length);
}

/** Share of the reference's characters that also appear in the guess — the closeness
 * measure for CJK-style scripts where single characters carry meaning. */
function characterOverlap(guess: string, reference: string): number {
  const referenceChars = [...reference];
  if (referenceChars.length === 0) return 0;
  const guessChars = new Set(guess);
  const hits = referenceChars.filter((char) => guessChars.has(char)).length;
  return hits / referenceChars.length;
}

/** Grades a guess about the woven word whose original was `originalSurface` (lemma
 * `lemma`). Correct = the original word itself or any source lemma sharing the same
 * target translation (dictionary synonyms). Close = strong partial match: ≥50% character
 * overlap (CJK) or ≥70% edit-similarity (alphabetic). Otherwise wrong. */
export function gradeGuess(
  guessRaw: string,
  originalSurface: string,
  lemma: string,
  loaded: LoadedLanguagePack,
): DiglotGuessGrade {
  const guess = normalize(guessRaw);
  if (guess.length === 0) return "wrong";
  const references = new Set<string>([normalize(originalSurface), normalize(lemma)]);
  const entry = loaded.pack.entries[lemma];
  if (entry !== undefined) {
    for (const synonym of loaded.lemmasByTarget.get(entry.target.toLowerCase()) ?? []) {
      references.add(normalize(synonym));
    }
  }
  for (const reference of references) {
    if (reference.length > 0 && guess === reference) return "correct";
  }
  for (const reference of references) {
    if (reference.length === 0) continue;
    if (characterOverlap(guess, reference) >= 0.5) return "close";
    const longest = Math.max(guess.length, reference.length);
    if (longest > 0 && 1 - editDistance(guess, reference) / longest >= 0.7) return "close";
  }
  return "wrong";
}
