/**
 * Purpose: the experimental search-build LLM contract (spec 023 §5) — prompt + Zod schema
 * for proposing an evidence-cited profile tree for a user-typed real-world role, plus the
 * pure pruning rules: drop every branch whose cited URL failed verification, and fail the
 * whole build when too little survives (宁缺毋假).
 * Main exports: searchedProfileProposalSchema, buildCompareProposalMessages,
 * significantTokens, verifyEvidenceText, pruneUnverifiedBranches, survivesThreshold,
 * MIN_SURVIVING_ITEMS, MIN_SURVIVING_SHARE.
 */
import type { ChatMessage } from "@breadcrumb/core-llm";
import { z } from "zod";

export const searchedProposalItemSchema = z.object({
  key: z.string().min(1).max(60),
  parentKey: z.string().min(1).max(60).nullable(),
  label: z.string().min(1).max(60),
  aliases: z.array(z.string().min(1).max(60)).max(8),
  /** The real material this item is taken from — name and a directly-openable URL. */
  sourceTitle: z.string().min(4).max(120),
  sourceUrl: z.string().url().max(300),
});

export const searchedProfileProposalSchema = z.object({
  title: z.string().min(1).max(40),
  description: z.string().min(1).max(200),
  items: z.array(searchedProposalItemSchema).min(4).max(80),
});

export type SearchedProposalItem = z.infer<typeof searchedProposalItemSchema>;

const SYSTEM_PROMPT = `你是一个知识范围画像构建器。给定一个真实存在的职业、身份或教育阶段，请依据真实公开资料（官方课程标准、职业技能标准、权威机构发布的课程或认证大纲）把这类人应掌握的知识整理成一棵树，以 JSON 返回：
{"title":"画像名，不超过40字","description":"一句话说明这是谁、依据什么资料，不超过200字","items":[{"key":"唯一短键","parentKey":"父节点的key，根节点为null","label":"知识条目名，不超过60字","aliases":["同义或子项名称，最多8个，必须同样来自资料"],"sourceTitle":"所依据资料的名称","sourceUrl":"该资料可直接打开的网址"}]}
请遵循：
- 每一条 item 都必须给出真实存在、可直接访问的资料出处；不同条目可以共用同一份资料的不同部分
- 禁止编造资料名或网址；对某条内容找不到可靠出处时，宁可不写这一条
- 树两到三层：根类目 → （子类目 →）具体知识单元；总条目数 10~60 之间为宜
- label 与 aliases 用该资料本身的用词，不要自行发挥`;

export interface CompareProposalInput {
  topic: string;
  /** True = prefer sources directly reachable from mainland China. */
  mainland: boolean;
}

export function buildCompareProposalMessages(input: CompareProposalInput): ChatMessage[] {
  const reachability = input.mainland ? "\n（请优先引用中国大陆可直接访问的资料来源）" : "";
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `画像对象：${input.topic}${reachability}` },
  ];
}

/** Tokens worth checking a fetched page for: ASCII runs ≥ 4 chars, CJK runs ≥ 2 chars. */
export function significantTokens(sourceTitle: string): string[] {
  const ascii = sourceTitle.toLowerCase().match(/[a-z0-9]{4,}/gu) ?? [];
  const cjk = sourceTitle.match(/\p{Script=Han}{2,}/gu) ?? [];
  return [...new Set([...ascii, ...cjk])];
}

/** Weak-but-honest content check: the fetched page must mention at least one significant
 * token of the cited material's title. Reachable-but-unrelated pages fail here. */
export function verifyEvidenceText(pageText: string, sourceTitle: string): boolean {
  const tokens = significantTokens(sourceTitle);
  if (tokens.length === 0) return false;
  const haystack = pageText.toLowerCase();
  return tokens.some((token) => haystack.includes(token.toLowerCase()));
}

/**
 * Drops every item whose own cited URL failed verification, together with its whole
 * subtree (a branch built on unverified evidence is gone, not patched). Children of
 * surviving parents keep their authored order.
 */
export function pruneUnverifiedBranches(
  items: readonly SearchedProposalItem[],
  verifiedUrls: ReadonlySet<string>,
): SearchedProposalItem[] {
  const byKey = new Map(items.map((item) => [item.key, item]));
  const verdictByKey = new Map<string, boolean>();
  function survives(item: SearchedProposalItem): boolean {
    const cached = verdictByKey.get(item.key);
    if (cached !== undefined) return cached;
    let verdict = verifiedUrls.has(item.sourceUrl);
    if (verdict && item.parentKey !== null) {
      const parent = byKey.get(item.parentKey);
      verdict = parent !== undefined && survives(parent);
    }
    verdictByKey.set(item.key, verdict);
    return verdict;
  }
  return items.filter((item) => survives(item));
}

/** Below either bound the whole build fails — a mostly-unverified profile must not ship. */
export const MIN_SURVIVING_ITEMS = 5;
export const MIN_SURVIVING_SHARE = 0.5;

export function survivesThreshold(proposedCount: number, survivingCount: number): boolean {
  if (survivingCount < MIN_SURVIVING_ITEMS) return false;
  return survivingCount / Math.max(1, proposedCount) >= MIN_SURVIVING_SHARE;
}

/** One search hit the rescue matcher can inspect (matches factcheck's EvidenceItem). */
export interface SourceSearchResult {
  url: string;
  title: string;
  snippet: string;
}

/**
 * Search rescue for a dead citation (ai_failures 2026-08-10: the model cites deep links
 * from memory and those rot — three builds died at 0/N verified). If any search result's
 * title+snippet mentions the cited material, the source demonstrably exists: return that
 * reachable URL to replace the rotten one. No hit → null, and the branch dies as before.
 */
export function findRescueUrl(
  results: readonly SourceSearchResult[],
  sourceTitles: readonly string[],
): string | null {
  for (const result of results) {
    const haystack = `${result.title} ${result.snippet}`;
    if (sourceTitles.some((title) => verifyEvidenceText(haystack, title))) {
      return result.url;
    }
  }
  return null;
}
