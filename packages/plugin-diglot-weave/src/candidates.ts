/**
 * Purpose: candidate extraction (spec 033) — maps word tokens to replaceable dictionary
 * occurrences, enforcing the runtime side of the T1 whitelist (collocation interiors,
 * capitalized surfaces, first-occurrence-only per lemma).
 * Main exports: extractCandidates, CandidateOccurrence.
 */
import type { LoadedLanguagePack } from "./packSchema";
import type { WordToken } from "./tokenize";

export interface CandidateOccurrence {
  /** Dictionary lemma (post lemmatization via the pack's forms table). */
  lemma: string;
  /** Exact surface text found in the message. */
  surface: string;
  start: number;
  end: number;
  clauseIndex: number;
}

/** Resolves a surface form to its dictionary lemma, or null when unknown. */
function resolveLemma(surface: string, loaded: LoadedLanguagePack): string | null {
  const viaForms = loaded.pack.forms[surface];
  if (viaForms !== undefined) return viaForms;
  if (loaded.pack.entries[surface] !== undefined) return surface;
  const lowercased = surface.toLowerCase();
  if (lowercased !== surface && loaded.pack.entries[lowercased] !== undefined) return lowercased;
  return null;
}

/** True when the token together with an adjacent word token forms a longer dictionary
 * word — replacing the interior of a collocation would break its meaning (spec 033
 * "never replace" rule). Concatenation is script-appropriate: direct for CJK-style
 * space-free text, space-joined otherwise. */
function isCollocationInterior(
  tokens: readonly WordToken[],
  index: number,
  loaded: LoadedLanguagePack,
): boolean {
  const current = tokens[index];
  if (current === undefined) return false;
  const findWordNeighbor = (from: number, step: -1 | 1): WordToken | undefined => {
    for (let cursor = from; cursor >= 0 && cursor < tokens.length; cursor += step) {
      const token = tokens[cursor];
      if (token === undefined) return undefined;
      if (token.isWordLike) return token;
      // Only plain whitespace may sit between collocation members; punctuation breaks it.
      if (token.text.trim().length > 0) return undefined;
    }
    return undefined;
  };
  const neighbors: Array<readonly [WordToken, WordToken]> = [];
  const previous = findWordNeighbor(index - 1, -1);
  const next = findWordNeighbor(index + 1, 1);
  if (previous !== undefined) neighbors.push([previous, current] as const);
  if (next !== undefined) neighbors.push([current, next] as const);
  for (const [left, right] of neighbors) {
    for (const joined of [`${left.text}${right.text}`, `${left.text} ${right.text}`]) {
      if (loaded.pack.entries[joined] !== undefined || loaded.pack.forms[joined] !== undefined) {
        return true;
      }
    }
  }
  return false;
}

/** True when a Latin-script surface is capitalized while the dictionary lemma is not —
 * the runtime proper-noun guard (build-time filtering can't see mid-sentence names). */
function looksLikeProperNoun(surface: string, lemma: string): boolean {
  const first = surface[0];
  if (first === undefined) return false;
  return first !== first.toLowerCase() && lemma[0] === lemma[0]?.toLowerCase();
}

/** Extracts every replaceable occurrence: known t1Safe lemma, not a collocation interior,
 * not a capitalized unknown, and only the first occurrence of each lemma (one replacement
 * per lemma per message keeps exposure counting honest). */
export function extractCandidates(
  tokens: readonly WordToken[],
  loaded: LoadedLanguagePack,
): CandidateOccurrence[] {
  const seen = new Set<string>();
  const candidates: CandidateOccurrence[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined || !token.isWordLike) continue;
    const lemma = resolveLemma(token.text, loaded);
    if (lemma === null) continue;
    const entry = loaded.pack.entries[lemma];
    if (entry === undefined || !entry.t1Safe) continue;
    if (seen.has(lemma)) continue;
    if (looksLikeProperNoun(token.text, lemma)) continue;
    if (isCollocationInterior(tokens, index, loaded)) continue;
    seen.add(lemma);
    candidates.push({
      lemma,
      surface: token.text,
      start: token.start,
      end: token.end,
      clauseIndex: token.clauseIndex,
    });
  }
  return candidates;
}
