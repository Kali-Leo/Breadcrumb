/**
 * Purpose: companion memory stream (spec 037) — ported from Stanford Generative Agents
 * (TS reference: langchain-ai/langchainjs's generative_agents module, Apache-2.0/MIT):
 * recency x importance x relevance retrieval scoring, the importance-rating contract, and
 * the reflection contract that turns accumulated importance into higher-level insights.
 * Main exports: CompanionMemoryLike, tokenizeForRelevance, scoreMemoryRetrieval,
 * retrieveMemories, IMPORTANCE_PROMPT, ImportanceResultSchema, buildImportanceUserMessage,
 * REFLECTION_THRESHOLD, shouldReflect, REFLECTION_PROMPT, ReflectionResultSchema,
 * buildReflectionUserMessage, buildObservationContent.
 */
import { segmentChinese } from "@breadcrumb/core-text";
import { z } from "zod";

export interface CompanionMemoryLike {
  id: string;
  kind: "observation" | "reflection";
  content: string;
  /** LLM-assigned memory-worthiness, 1..10. */
  importance: number;
  /** ISO 8601 timestamp. */
  created_at: string;
}

const CJK_RANGES: readonly [number, number][] = [
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0x3400, 0x4dbf], // CJK Extension A
];

function isCjk(char: string): boolean {
  const codePoint = char.codePointAt(0) ?? 0;
  return CJK_RANGES.some(([from, to]) => codePoint >= from && codePoint <= to);
}

/** Tokenizes text for relevance scoring: lowercase, alphanumeric runs as words, and CJK runs
 * split by the dictionary segmenter (@breadcrumb/core-text) rather than blindly into bigrams
 * — "计算机科学" is two words, not four overlapping pairs, and the pairs used to dilute every
 * score they took part in. Unknown runs still fall back to bigrams inside the segmenter.
 * Exported so relevance scoring is independently testable. */
export function tokenizeForRelevance(text: string): Set<string> {
  const lowered = text.toLowerCase();
  const tokens = new Set<string>();
  let alnumRun = "";
  let cjkRun = "";

  const flushAlnum = (): void => {
    if (alnumRun.length > 0) tokens.add(alnumRun);
    alnumRun = "";
  };
  const flushCjk = (): void => {
    for (const token of segmentChinese(cjkRun)) tokens.add(token);
    cjkRun = "";
  };

  for (const char of lowered) {
    if (isCjk(char)) {
      flushAlnum();
      cjkRun += char;
    } else if (/[a-z0-9]/.test(char)) {
      flushCjk();
      alnumRun += char;
    } else {
      flushAlnum();
      flushCjk();
    }
  }
  flushAlnum();
  flushCjk();

  return tokens;
}

// langchainjs's generative-agent reference decays recency by 0.99 per hour with an explicit
// time-weighting term; we fold that into a single per-hour factor and pick a slightly slower
// 0.995 so memories from earlier in the same long companion session do not fade too fast.
const RECENCY_DECAY_PER_HOUR = 0.995;

/** Generative Agents retrieval score: recency (exponential decay by hours since creation) x
 * importance (0..1) x relevance (query/content token overlap), each already in [0, 1], so the
 * product is in [0, 1]. */
export function scoreMemoryRetrieval(
  memory: CompanionMemoryLike,
  query: string,
  nowIso: string,
): number {
  const hoursPassed = Math.max(0, (Date.parse(nowIso) - Date.parse(memory.created_at)) / 3_600_000);
  const recency = RECENCY_DECAY_PER_HOUR ** hoursPassed;
  const importance = memory.importance / 10;

  const queryTokens = tokenizeForRelevance(query);
  const contentTokens = tokenizeForRelevance(memory.content);
  let overlap = 0;
  for (const token of queryTokens) {
    if (contentTokens.has(token)) overlap += 1;
  }
  const relevance = overlap / Math.max(1, queryTokens.size);

  return recency * importance * relevance;
}

/** Top-`limit` memories by retrieval score; ties break newest-first for a stable order. */
export function retrieveMemories(
  memories: readonly CompanionMemoryLike[],
  query: string,
  nowIso: string,
  limit: number,
): CompanionMemoryLike[] {
  return memories
    .map((memory) => ({ memory, score: scoreMemoryRetrieval(memory, query, nowIso) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Date.parse(b.memory.created_at) - Date.parse(a.memory.created_at);
    })
    .slice(0, limit)
    .map((entry) => entry.memory);
}

export const IMPORTANCE_PROMPT =
  "你在评估一条关于学习者的观察记录值得记住的程度,按 1-10 打分:" +
  "1 分是日常寒暄、没有实质信息;10 分是对了解这位学习者非常重要," +
  "比如明确的困难、目标、偏好,或反复出现的模式。" +
  '只返回 JSON:{"importance": 整数(1-10)}';

export const ImportanceResultSchema = z.object({
  importance: z.number().int().min(1).max(10),
});
export type ImportanceResult = z.infer<typeof ImportanceResultSchema>;

export function buildImportanceUserMessage(observationText: string): string {
  return `观察记录:\n${observationText}`;
}

/** Generative Agents reflection trigger: sum of importance scores since the last reflection. */
export const REFLECTION_THRESHOLD = 25;

export function shouldReflect(importanceSumSinceLastReflection: number): boolean {
  return importanceSumSinceLastReflection >= REFLECTION_THRESHOLD;
}

export const REFLECTION_PROMPT =
  "你在阅读关于同一位学习者的一组近期观察记录,请归纳出 1-3 条更高层次的洞察——" +
  "关于这位学习者的模式、困难或偏好,平实陈述即可,不评价这个人的价值,不夸赞。" +
  '只返回 JSON:{"insights": ["洞察1", "洞察2"]}';

export const ReflectionResultSchema = z.object({
  insights: z.array(z.string().min(1)).min(1).max(3),
});
export type ReflectionResult = z.infer<typeof ReflectionResultSchema>;

export function buildReflectionUserMessage(observations: readonly CompanionMemoryLike[]): string {
  const lines = observations.map((observation) => `- ${observation.content}`).join("\n");
  return `近期观察记录:\n${lines}`;
}

const OBSERVATION_SIDE_MAX_CHARS = 200;

/** Truncates by Unicode code point (not UTF-16 code unit), so a surrogate pair never splits. */
function truncateAtCharBoundary(text: string, maxChars: number): string {
  return Array.from(text).slice(0, maxChars).join("");
}

/** Deterministic local condensation of one chat round into an observation-memory string —
 * no LLM call. Each side is independently truncated to 200 characters. */
export function buildObservationContent(userText: string, assistantText: string): string {
  const user = truncateAtCharBoundary(userText, OBSERVATION_SIDE_MAX_CHARS);
  const assistant = truncateAtCharBoundary(assistantText, OBSERVATION_SIDE_MAX_CHARS);
  return `学习者说:${user}/伙伴回应:${assistant}`;
}
