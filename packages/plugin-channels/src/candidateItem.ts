/**
 * Purpose: the contract every external content channel produces — one candidate item that the
 * discovery feed can rank and show. Adapters parse network payloads into this shape and nothing
 * reaches the rest of the app without passing this schema first.
 * Main exports: candidateItemKindSchema, candidateItemSchema, parseCandidateItems,
 * CandidateItem, CandidateItemKind.
 */
import { z } from "zod";

/** The content shapes the reader can end up in: an article overlay, a video player, an audio
 * player, a forum thread, or a paper abstract. */
export const candidateItemKinds = ["article", "video", "podcast", "discussion", "paper"] as const;

export const candidateItemKindSchema = z.enum(candidateItemKinds);

export type CandidateItemKind = z.infer<typeof candidateItemKindSchema>;

export const candidateItemSchema = z.object({
  /** Stable across refetches: `${sourceId}:${feed guid or link}`. Used to dedupe the pool. */
  id: z.string().min(1),
  /** The catalog source this item came from. */
  sourceId: z.string().min(1),
  kind: candidateItemKindSchema,
  /** Where the item opens. Always absolute — adapters resolve relative feed links first. */
  url: z.url(),
  /** The direct playable media address, today always an audio enclosure: the file the in-app
   * player loads, as opposed to url, which is the page a browser opens. Null when the channel
   * publishes no such address — every article, paper and discussion, and podcast feeds that
   * link only an episode page. */
  mediaUrl: z.url().nullable(),
  title: z.string().min(1),
  /** Plain text, HTML already stripped. Empty string when the feed carried no description. */
  summary: z.string(),
  coverUrl: z.url().nullable(),
  author: z.string().min(1).nullable(),
  /** ISO 8601 UTC instant. Feeds without a date get the moment we observed the item. */
  publishedAt: z.iso.datetime(),
  /** Crowd signal from upstream (score, reply count, chart position) normalized to 0..1.
   * Null when the channel publishes no such number — most plain RSS feeds. */
  upstreamSignal: z.number().min(0).max(1).nullable(),
});

export type CandidateItem = z.infer<typeof candidateItemSchema>;

/** Validates a batch, dropping items that fail rather than failing the whole fetch: one broken
 * entry in a 600-episode feed must not cost the reader the other 599. */
export function parseCandidateItems(values: readonly unknown[]): {
  items: CandidateItem[];
  rejectedCount: number;
} {
  const items: CandidateItem[] = [];
  let rejectedCount = 0;
  for (const value of values) {
    const parsed = candidateItemSchema.safeParse(value);
    if (parsed.success) items.push(parsed.data);
    else rejectedCount += 1;
  }
  return { items, rejectedCount };
}
