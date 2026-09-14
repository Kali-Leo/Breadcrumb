/**
 * Purpose: the source material a 学习模式 round is taught against — turning the evidence
 * layer's items into the numbered block that opens the prompt, and deciding what order the
 * numbered passages sit in.
 *
 * Two decisions live here, both from measurement rather than taste:
 *  - **Eight passages.** 2026-09-12-检索与重排-大规模实测 reports Recall@8 as "产品最该看的那个"
 *    — the number of passages a product actually feeds a model — and measures 0.708 macro for
 *    single-route e5 at that depth. Eight is the depth those numbers describe.
 *  - **U-shaped ordering.** Attention over a long context is strongest at its two ends, so the
 *    best passage opens the block and the second-best closes it; ranks 3, 5, 7 fill forward
 *    from the front and 4, 6, 8 fill backward from the end. Handing the model rank 8 in the
 *    last, most-read slot would be spending the second-strongest position on the weakest
 *    material.
 * Nothing here is UI: the block is prompt text, and the passage list is what the annotation
 * layer later aligns the answer against.
 * Main exports: TopicPassage, TOPIC_PASSAGE_COUNT, LIBRARY_SOURCE, orderForAttention,
 * buildTopicPassages, formatPassageBlock.
 */
import type { EvidenceItem } from "../evidence/provider";

/** How many passages one topic carries into the prompt. */
export const TOPIC_PASSAGE_COUNT = 8;

/** The `source` of a passage from the reader's own library. Reserved next to the provider
 * names so that the app that builds such passages and the screen that names them agree on
 * one id; for these, `title` is the passage's heading path rather than a page name. */
export const LIBRARY_SOURCE = "library";

export interface TopicPassage {
  /** 1-based, and it is the display order — `[3]` is the third block in the prompt. */
  index: number;
  /** Provider name, shown to the reader as the source of the quote. */
  source: string;
  title: string;
  url: string;
  text: string;
}

/**
 * Relevance-ordered in, attention-ordered out: rank 1 first, rank 2 last, the rest folded in
 * between. A list of one or two comes back unchanged (there is no middle to protect).
 */
export function orderForAttention<T>(items: readonly T[]): T[] {
  const front: T[] = [];
  const back: T[] = [];
  for (const [rank, item] of items.entries()) {
    if (rank % 2 === 0) front.push(item);
    else back.unshift(item);
  }
  return [...front, ...back];
}

/**
 * The topic's passages, capped, de-duplicated by URL, and put in attention order. Items whose
 * snippet is blank are dropped: a numbered passage with nothing in it is a citation slot the
 * model can fill from memory, which is the exact failure this whole layer exists to remove.
 */
export function buildTopicPassages(
  items: readonly EvidenceItem[],
  limit: number = TOPIC_PASSAGE_COUNT,
): TopicPassage[] {
  const seen = new Set<string>();
  const usable: EvidenceItem[] = [];
  for (const item of items) {
    if (item.snippet.trim().length === 0 || seen.has(item.url)) continue;
    seen.add(item.url);
    usable.push(item);
    if (usable.length >= limit) break;
  }
  return orderForAttention(usable).map((item, position) => ({
    index: position + 1,
    source: item.source,
    title: item.title,
    url: item.url,
    text: item.snippet.trim(),
  }));
}

/**
 * The block that opens the prompt. One line per passage, `[n] 来源名 · 原文`, and one lead
 * line naming what the block is — the model is never asked to write these numbers back, so
 * the numbering exists for the reader's side of the screen, where the code puts it.
 */
export function formatPassageBlock(passages: readonly TopicPassage[]): string {
  const lines = passages.map((passage) => `[${passage.index}] ${passage.source} · ${passage.text}`);
  return `这个话题的资料：\n${lines.join("\n")}`;
}
