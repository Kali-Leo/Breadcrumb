/**
 * Purpose: the LLM refinement tier (spec 033 T13) — prompt, response contract and the
 * pure application logic: in-context disambiguation of scheduled word replacements plus
 * at most one idiomatic phrase weave, all behind hard diff guards. The actual LLM call
 * and metering live in the app layer.
 * Main exports: buildLlmRefineMessages, llmRefineResponseSchema, applyLlmRefinement.
 */
import { z } from "zod";
import { hashContext } from "./contextNovelty";
import { type ReplacementPatch, verifyPatches } from "./replace";

/** A single target-language word (letters/apostrophe/hyphen — no spaces). */
const SINGLE_WORD_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}'-]*$/u;
/** Clause breakers a phrase replacement may not cross (equivalence-constraint proxy:
 * code-switch points must sit at boundaries both grammars allow). */
const PHRASE_BREAKERS = /[,.;:!?，。;:!?…\n]/;

export const llmRefineResponseSchema = z.object({
  /** One verdict per scheduled word replacement, matched by lemma. */
  words: z
    .array(
      z.object({
        lemma: z.string().min(1).max(60),
        verdict: z.enum(["keep", "retranslate", "drop"]),
        /** The context-correct single word for "retranslate". Models often echo an empty
         * or null target on keep/drop verdicts — tolerated here, filtered in application. */
        target: z.string().max(40).nullish(),
      }),
    )
    .max(8),
  /** At most one idiomatic phrase weave, or null. */
  phrase: z
    .object({
      /** Exact substring of the original message to replace. */
      original: z.string().min(2).max(40),
      /** The idiomatic target-language expression. */
      replacement: z.string().min(1).max(60),
      /** Short source-language gloss shown on hover. */
      gloss: z.string().min(1).max(80),
    })
    .nullable(),
});

export type LlmRefineResponse = z.infer<typeof llmRefineResponseSchema>;

export interface LlmRefineInput {
  content: string;
  sourceLang: string;
  targetLang: string;
  /** The T1 scheduler's picks: lemma → chosen dictionary translation. */
  replacements: ReadonlyArray<{ lemma: string; surface: string; target: string }>;
}

/** Chat messages for the refinement call. One plain instruction, JSON out. */
export function buildLlmRefineMessages(
  input: LlmRefineInput,
): Array<{ role: "system" | "user"; content: string }> {
  const list = input.replacements
    .map((r) => `- lemma「${r.lemma}」(原文「${r.surface}」) → 词典译法「${r.target}」`)
    .join("\n");
  return [
    {
      role: "system",
      content: `你是语言学习应用里的替换审校器。消息原文是 ${input.sourceLang},学习目标语言是 ${input.targetLang}。给定若干「原词→目标语言译法」的候选替换,请:
1. 逐条判断词典译法在这句语境下是否正确:正确回 keep;语境下应换一个更准确的单个目标语言词回 retranslate 并给 target;这个词在语境里不适合被替换(如构成专名、双关、引用)回 drop。
2. 另外最多提出一个「短语级织入」:从原文里选一个 2-8 字的连续短语(不跨标点),给出目标语言的地道对应表达和一句 ${input.sourceLang} 释义;没有合适的就回 null。
只返回 JSON:{"words":[{"lemma":"…","verdict":"keep|retranslate|drop","target":"…"}],"phrase":{"original":"…","replacement":"…","gloss":"…"}|null}`,
    },
    { role: "user", content: `消息原文:\n${input.content}\n\n候选替换:\n${list}` },
  ];
}

export interface RefinementOutcome {
  patches: ReplacementPatch[];
  /** Lemmas the model dropped or retranslated — for diagnostics. */
  changedLemmas: string[];
}

/**
 * Applies a refinement response to the T1 patches, defensively: invalid retranslations
 * keep the dictionary word, an invalid phrase is ignored, and if the final patch set
 * fails the diff guard the original patches are returned untouched. The LLM can only
 * ever swap replacement text or remove patches — never touch anything else.
 */
export function applyLlmRefinement(
  content: string,
  patches: readonly ReplacementPatch[],
  refinement: LlmRefineResponse,
): RefinementOutcome {
  const verdictByLemma = new Map(refinement.words.map((word) => [word.lemma, word]));
  const changedLemmas: string[] = [];
  const refined: ReplacementPatch[] = [];
  for (const patch of patches) {
    const verdict = verdictByLemma.get(patch.lemma);
    if (verdict === undefined || verdict.verdict === "keep") {
      refined.push(patch);
      continue;
    }
    if (verdict.verdict === "drop") {
      changedLemmas.push(patch.lemma);
      continue;
    }
    const target = verdict.target?.trim() ?? "";
    if (
      SINGLE_WORD_PATTERN.test(target) &&
      target.toLowerCase() !== patch.replacement.toLowerCase()
    ) {
      refined.push({ ...patch, replacement: target });
      changedLemmas.push(patch.lemma);
    } else {
      refined.push(patch); // malformed retranslation → keep the dictionary word
    }
  }

  const phrase = refinement.phrase;
  if (phrase !== null && !PHRASE_BREAKERS.test(phrase.original)) {
    const start = content.indexOf(phrase.original);
    const overlaps = (s: number, e: number) => refined.some((p) => s < p.end && p.start < e);
    if (start >= 0 && !overlaps(start, start + phrase.original.length)) {
      refined.push({
        start,
        end: start + phrase.original.length,
        original: phrase.original,
        replacement: phrase.replacement,
        lemma: `phrase:${hashContext(phrase.original)}`,
        kind: "phrase",
        gloss: phrase.gloss,
      });
    }
  }

  const ordered = [...refined].sort((a, b) => a.start - b.start);
  if (!verifyPatches(content, ordered)) {
    return { patches: [...patches], changedLemmas: [] };
  }
  return { patches: ordered, changedLemmas };
}
