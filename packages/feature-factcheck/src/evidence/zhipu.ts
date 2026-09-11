/**
 * Purpose: the open-web evidence provider (layer 3) — Zhipu's standalone search endpoint,
 * which does the search AND returns each page's own text, CORS-open and reachable from the
 * mainland (measured 2026-09-11: median 0.6 s, 16 concurrent without a 429). It is the one
 * source in this chain that costs money (¥0.01 a call) and the one that sends the extracted
 * claim's query to a third-party search engine, so it is off by default and the app's switch
 * says both things out loud. It is also the only path that works at all for the browser
 * edition on a mainland network. Three measured rules shape the request: `search_pro_bing`,
 * because the default engine's first hit on 珠峰海拔 was a Q&A page carrying the 2005 figure;
 * a Wikipedia domain preference (soft, not a filter); and no result without a link.
 * Language gate: Hindi, Bengali and Arabic queries come back as unrelated Chinese pages (the
 * query is rewritten before it reaches any engine, and the entity is lost) — confident wrong
 * evidence is worse than none, so those languages never reach this layer.
 * Main exports: createZhipuSearchProvider, ZhipuProviderOptions, zhipuSupportsLanguage,
 * ZHIPU_SEARCH_LANGUAGES, ZHIPU_SEARCH_PRICE_CNY.
 */
import { z } from "zod";
import type { EvidenceItem, EvidenceProvider, EvidenceSearchResult, FetchLike } from "./provider";
import { DEFAULT_TIMEOUT_MS } from "./provider";
import { withRequestBudget } from "./requestBudget";
import { wikiEditionOf } from "./wikimedia";

const ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/web_search";

/** Zhipu's published per-call price for the search endpoint, CNY. Shown beside the switch. */
export const ZHIPU_SEARCH_PRICE_CNY = 0.01;

/** Primary language subtags the endpoint returned relevant results for (5/5 zh, sw; en with
 * some wording sensitivity). Everything else measured as garbage or empty. */
export const ZHIPU_SEARCH_LANGUAGES: readonly string[] = ["zh", "en", "sw"];

export function zhipuSupportsLanguage(languageCode: string): boolean {
  const primary = languageCode.toLowerCase().split("-")[0] ?? "";
  return ZHIPU_SEARCH_LANGUAGES.includes(primary);
}

/** Results asked for per call; the call is what is billed, not the row count. */
const RESULT_COUNT = 5;

const responseSchema = z.object({
  search_result: z
    .array(
      z.object({
        title: z.string().default(""),
        content: z.string().default(""),
        link: z.string().default(""),
      }),
    )
    .default([]),
});

export interface ZhipuProviderOptions {
  fetchImpl: FetchLike;
  apiKey: string;
  /** The learner's language: decides the Wikipedia edition preferred in results. The caller
   * is expected to have checked zhipuSupportsLanguage first. */
  language: string;
  timeoutMs?: number;
}

/** Links arrive double-URL-encoded («%25E7…»); one decode, then the URL class re-encodes
 * whatever is left into a canonical form. Anything that is not an http(s) URL is dropped. */
export function normalizeZhipuLink(raw: string): string | null {
  if (raw.length === 0) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Not percent-encoded after all; use as written.
  }
  try {
    const url = new URL(decoded);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/** The page text as Zhipu returns it, with its two measured escaping bugs undone: a literal
 * `x0a` where a newline was, and half-width CJK punctuation variants. Both sides of the anchor
 * gate see this same string, so the cleanup cannot cost a match. */
export function cleanZhipuContent(content: string): string {
  return content
    .replace(/\\?x0a/g, " ")
    .replace(/｡/g, "。")
    .replace(/､/g, "、")
    .replace(/\s+/g, " ")
    .trim();
}

export function createZhipuSearchProvider(options: ZhipuProviderOptions): EvidenceProvider {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const edition = wikiEditionOf(options.language) ?? "en";
  return {
    name: "zhipu",
    async search(query: string, limit: number): Promise<EvidenceSearchResult> {
      if (limit < 1) return { items: [], failed: false };
      try {
        const payload = await withRequestBudget(timeoutMs, async (signal) => {
          const response = await options.fetchImpl(ENDPOINT, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${options.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              search_engine: "search_pro_bing",
              search_query: query,
              count: RESULT_COUNT,
              search_domain_filter: `${edition}.wikipedia.org`,
            }),
            signal,
          });
          return response.ok ? ((await response.json()) as unknown) : null;
        });
        if (payload === null) return { items: [], failed: true };
        const items: EvidenceItem[] = [];
        for (const result of responseSchema.parse(payload).search_result) {
          if (items.length >= limit) break;
          const url = normalizeZhipuLink(result.link);
          const snippet = cleanZhipuContent(result.content);
          // No link means nothing the learner could open, and nothing the pipeline could
          // de-duplicate by; measured at about one result in twenty.
          if (url === null || snippet.length === 0) continue;
          items.push({ url, title: result.title || url, snippet, source: "zhipu" });
        }
        return { items, failed: false };
      } catch {
        return { items: [], failed: true };
      }
    },
  };
}
