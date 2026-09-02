/**
 * Purpose: LLM term-marking (spec 043) — prompt assembly for the one-shot flash call that
 * picks which words in a just-finished answer would trip up this learner, plus the pure
 * post-processing: conditional density clipping (unlimited once the learner is well enough
 * understood, else a strict per-60-characters cap) and locating each surviving term's first
 * occurrence in the answer as a door-shaped patch.
 * Main exports: buildTermMarkingMessages, termMarkResponseSchema, TermMarkingMessage,
 * clipTermsByDensity, locateTermPatches, LEARNER_EVIDENCE_THRESHOLD,
 * TERM_DENSITY_CHARS_PER_TERM.
 */
import { z } from "zod";
import type { DoorCandidate } from "./doorPick";

export interface TermMarkingMessage {
  role: "system" | "user";
  content: string;
}

export const termMarkResponseSchema = z.object({
  /** Ordered obstruction-descending (most-likely-to-trip-up first). Empty = nothing worth
   * marking in this answer. */
  terms: z.array(z.object({ term: z.string().min(1).max(60) })).max(50),
});

/** Spec 043 §3's three rules folded into one instruction: prefer marking too few over too
 * many, never mark a word any beginner already knows, never mark a word already on the lit
 * list — plus the ordering requirement. */
const TERM_MARKING_SYSTEM_PROMPT =
  "你在给刚生成的一段回答做生词标注：挑出会让这个学习者读起来卡壳的词或短语，可以是知识树里没有的新词，也可以是多字短语。" +
  "规则：宁少勿多，拿不准就不标；排除任何初学者必然认识的基础词；排除已点亮清单里的词（已经掌握，不需要再标）。" +
  '按造成理解阻碍的程度从高到低排序。只返回 JSON：{"terms":[{"term":"…"}]}，没有需要标注的词就返回空数组。';

/** Assembles the term-marking call's two messages — the answer plus the learner's two-list
 * evidence context (spec 043 §2). Both lists may be empty (a brand-new learner has neither). */
export function buildTermMarkingMessages(
  answerText: string,
  litLabels: readonly string[],
  lookedUpLabels: readonly string[],
): TermMarkingMessage[] {
  const litList = litLabels.length > 0 ? litLabels.join("、") : "（无）";
  const lookedUpList = lookedUpLabels.length > 0 ? lookedUpLabels.join("、") : "（无）";
  return [
    { role: "system", content: TERM_MARKING_SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `回答原文：\n${answerText}\n\n` +
        `已点亮清单（他已经掌握，不要标）：${litList}\n\n` +
        `查词史（他查过这些词——当时不懂，看过解释后有初识，标注时按此判断阻碍程度，不代表要排除）：${lookedUpList}`,
    },
  ];
}

/** At or above this much learner evidence (distinct nodes/words with any footprint, claim,
 * matched guess, or lookup), the system is considered to understand the learner well enough
 * that every LLM-picked term ships uncapped (spec 043 §4, Leo's "拒绝固定数字上限" ruling). */
export const LEARNER_EVIDENCE_THRESHOLD = 30;
/** Below the evidence threshold, density falls back to at most one term per this many
 * characters of the answer (spec 043 §4). */
export const TERM_DENSITY_CHARS_PER_TERM = 60;

/** Clips an already obstruction-sorted term list down to the density cap when the learner
 * isn't yet well understood; returns it unchanged once evidenceCount clears the threshold. */
export function clipTermsByDensity(
  terms: readonly string[],
  answerLength: number,
  evidenceCount: number,
  threshold: number = LEARNER_EVIDENCE_THRESHOLD,
): string[] {
  if (evidenceCount >= threshold) return [...terms];
  const cap = Math.ceil(answerLength / TERM_DENSITY_CHARS_PER_TERM);
  return terms.slice(0, Math.max(cap, 0));
}

function spansOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Finds the first case-insensitive occurrence of `term` in `text`, preserving the text's
 * original casing in the returned slice, or null when the term isn't actually present (the
 * model can hallucinate a word that never appears verbatim). */
function findFirstOccurrence(
  text: string,
  term: string,
): { start: number; end: number; original: string } | null {
  const index = text.toLowerCase().indexOf(term.toLowerCase());
  if (index === -1) return null;
  return {
    start: index,
    end: index + term.length,
    original: text.slice(index, index + term.length),
  };
}

/** Locates each term's first occurrence in the answer as a door-shaped patch (nodeId left
 * null — enrichment against known node labels is the caller's job, spec 043 §6). Terms are
 * processed in the given (obstruction-descending) order; a term that doesn't appear verbatim,
 * or whose only occurrence overlaps a reserved span or an already-placed term, is dropped —
 * the result is sorted back into reading order. */
export function locateTermPatches(
  answerText: string,
  terms: readonly string[],
  reservedSpans: readonly { start: number; end: number }[] = [],
): DoorCandidate[] {
  const occupied: { start: number; end: number }[] = [...reservedSpans];
  const placed: DoorCandidate[] = [];
  for (const term of terms) {
    const trimmed = term.trim();
    if (trimmed.length === 0) continue;
    const match = findFirstOccurrence(answerText, trimmed);
    if (match === null) continue;
    if (occupied.some((span) => spansOverlap(span, match))) continue;
    placed.push({ ...match, nodeId: null });
    occupied.push(match);
  }
  return placed.sort((a, b) => a.start - b.start);
}
