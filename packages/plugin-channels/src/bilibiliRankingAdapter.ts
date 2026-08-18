/**
 * Purpose: the bilibili ranking adapter. The 2026-08-18 content survey measured three list
 * endpoints answering an anonymous request with no cookie and no wbi signature — the category
 * rankings (`ranking/v2?rid=36` 知识, `rid=188` 科技数码) and 入站必刷
 * (`popular/precious`) — and every item in them carries a cover picture, which is the whole reason
 * this channel exists: the catalog before it was almost entirely plain-text feeds, so the grid was
 * a wall of grey text. Items open at `bilibili.com/video/<bvid>`, which the desktop player already
 * turns into bilibili's own embed, so these cards play in the app.
 * Main exports: bilibiliRankingUrls, bilibiliRankingItemSchema, parseBilibiliRanking,
 * fetchBilibiliRankingSource.
 */
import { z } from "zod";
import { type CandidateItem, parseCandidateItems } from "./candidateItem";
import type { ChannelSource } from "./channelCatalog";
import { firstNonEmptyText, stripHtmlToPlainText } from "./feedText";
import { type FetchContext, jsonAcceptHeader } from "./fetchContract";
import { maximumSummaryLength } from "./genericFeedItemMapping";
import { parseJsonPayload } from "./jsonPayload";
import { outcomeOnlyResult, type SourceFetchResult } from "./sourceFetchResult";
import { normalizeCountToSignal, saturationCounts } from "./upstreamSignal";

/** The three addresses the survey verified. Only a handful of `rid` values answer at all — the
 * survey found 36, 188, 3, 4, 23 and 234 working and the other twenty returning risk control — and
 * of those only the two below are learning categories. */
export const bilibiliRankingUrls = {
  knowledge: "https://api.bilibili.com/x/web-interface/ranking/v2?rid=36&type=all",
  technology: "https://api.bilibili.com/x/web-interface/ranking/v2?rid=188&type=all",
  mustWatch: "https://api.bilibili.com/x/web-interface/popular/precious",
} as const;

export const bilibiliVideoPageBaseUrl = "https://www.bilibili.com/video/";

const optionalText = z.string().nullish();

export const bilibiliRankingItemSchema = z.object({
  /** The id every bilibili address is written with today. */
  bvid: z.string().min(1),
  title: z.string().min(1),
  /** Cover picture. Served over plain http or protocol-relative; normalized before use. */
  pic: optionalText,
  /** Usually empty on ranking items; the UP's own note is in `dynamic` when it is. */
  desc: optionalText,
  dynamic: optionalText,
  /** Unix seconds. */
  pubdate: z.number().nonnegative().optional(),
  owner: z.object({ name: optionalText }).nullish(),
  stat: z.object({ view: z.number().nonnegative().optional() }).nullish(),
});

export type BilibiliRankingItem = z.infer<typeof bilibiliRankingItemSchema>;

/**
 * bilibili answers 200 whatever happened; the verdict is in `code`, and a refused request carries
 * no `data` at all (risk control answers `{"code":-352,"message":"-352","ttl":1}`), which is why
 * `data` is optional here rather than merely empty.
 */
export const bilibiliEnvelopeSchema = z.object({
  code: z.number(),
  message: optionalText,
  data: z.object({ list: z.array(z.unknown()).nullish() }).nullish(),
});

/**
 * Covers arrive as `http://i0.hdslb.com/…` and sometimes as `//i0.hdslb.com/…`. Both load over
 * TLS from the same host, and the card must not be the one place the app drops to plain http.
 */
export function toHttpsImageUrl(value: string | null | undefined): string | null {
  const trimmed = firstNonEmptyText(value);
  if (trimmed === null) return null;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("http://")) return `https://${trimmed.slice("http://".length)}`;
  return trimmed.startsWith("https://") ? trimmed : null;
}

function toCandidateDraft(
  item: BilibiliRankingItem,
  sourceId: string,
  observedAtIso: string,
): unknown {
  const summary = stripHtmlToPlainText(firstNonEmptyText(item.desc, item.dynamic) ?? "");
  return {
    id: `${sourceId}:${item.bvid}`,
    sourceId,
    kind: "video",
    url: `${bilibiliVideoPageBaseUrl}${encodeURIComponent(item.bvid)}`,
    mediaUrl: null,
    title: stripHtmlToPlainText(item.title) || item.title,
    summary: summary.slice(0, maximumSummaryLength).trimEnd(),
    coverUrl: toHttpsImageUrl(item.pic),
    author: firstNonEmptyText(item.owner?.name),
    publishedAt:
      item.pubdate === undefined ? observedAtIso : new Date(item.pubdate * 1000).toISOString(),
    upstreamSignal: normalizeCountToSignal(item.stat?.view ?? 0, saturationCounts.bilibiliViews),
  };
}

export interface BilibiliParseResult {
  items: CandidateItem[];
  skippedEntryCount: number;
  parseError: string | null;
  /** Non-zero means bilibili refused the request; the poll counts as failed, not as empty. */
  responseCode: number | null;
}

/** Takes the raw body, so a captive-portal page or a truncated payload fails here, not upstream. */
export function parseBilibiliRanking(
  sourceId: string,
  body: string,
  observedAt?: Date,
): BilibiliParseResult {
  const payload = parseJsonPayload(body);
  if (!payload.ok) {
    return { items: [], skippedEntryCount: 0, parseError: payload.error, responseCode: null };
  }
  const envelope = bilibiliEnvelopeSchema.safeParse(payload.value);
  if (!envelope.success) {
    return {
      items: [],
      skippedEntryCount: 0,
      parseError: "bilibili response is not a list envelope",
      responseCode: null,
    };
  }
  if (envelope.data.code !== 0) {
    return {
      items: [],
      skippedEntryCount: 0,
      parseError: null,
      responseCode: envelope.data.code,
    };
  }

  const observedAtIso = (observedAt ?? new Date()).toISOString();
  const drafts: unknown[] = [];
  let skippedEntryCount = 0;
  for (const entry of envelope.data.data?.list ?? []) {
    const item = bilibiliRankingItemSchema.safeParse(entry);
    if (!item.success) {
      skippedEntryCount += 1;
      continue;
    }
    drafts.push(toCandidateDraft(item.data, sourceId, observedAtIso));
  }
  const parsed = parseCandidateItems(drafts);
  return {
    items: parsed.items,
    skippedEntryCount: skippedEntryCount + parsed.rejectedCount,
    parseError: null,
    responseCode: 0,
  };
}

/**
 * A refused request comes back as a failed outcome rather than as an empty success, because that
 * is what it is: the address is fine and the app is being told to slow down. Reporting it as
 * "fetched, nothing new" would clear the failure streak and have us knock again on the next
 * round; reporting it as failed puts the source into the backoff every other dead channel uses.
 * The survey measured this triggering after only a few requests from one address, so the catalog
 * entries poll these lists a few times a day at most.
 */
export async function fetchBilibiliRankingSource(
  source: ChannelSource,
  context: FetchContext,
  observedAt?: Date,
): Promise<SourceFetchResult> {
  const outcome = await context.fetchUrl(source.endpoint.feedUrl, {
    kind: "poll",
    accept: jsonAcceptHeader,
  });
  if (outcome.status !== "fetched") return outcomeOnlyResult(source.id, outcome);
  const parsed = parseBilibiliRanking(source.id, outcome.body, observedAt);
  if (parsed.responseCode !== null && parsed.responseCode !== 0) {
    return outcomeOnlyResult(source.id, {
      status: "failed",
      reason: `bilibili refused the request (code ${parsed.responseCode})`,
      httpStatus: 200,
    });
  }
  return {
    sourceId: source.id,
    outcome,
    items: parsed.items,
    skippedEntryCount: parsed.skippedEntryCount,
    parseError: parsed.parseError,
    repairedFromTruncation: false,
    followUpRequestCount: 0,
  };
}
