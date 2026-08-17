/**
 * Purpose: turns candidate items from the channel layer into cards in the local pool (spec 053
 * §3) — one card per item, the source's own summary as the hook, the channel (for arXiv, the
 * category; for a feed the reader pasted in, its hostname) as the topic, and an id that is stable
 * across refetches so polling the same feed again inserts nothing. Cards land ready to display:
 * no embedding, no quality score, no network needed to show them.
 * Side effects: reads the pool's ids and inserts card rows.
 * Main exports: landCandidateItems, CandidateGroup, cardRowFromCandidate.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import {
  type CandidateItem,
  type ChannelSource,
  loadStarterChannelCatalog,
} from "@breadcrumb/plugin-channels";
import { getRepos } from "./db";
import { feedHostLabel, feedUrlFromUserFeedSourceId } from "./discoveryChannelSources";
import { newId } from "./time";

/** A card's hook is one glance worth of text under the title; feed summaries run to whole
 * articles, so they are cut here rather than in the grid. */
const HOOK_CHARACTER_CAP = 120;

/** One batch of items that share a topic and a reason for being fetched. */
export interface CandidateGroup {
  items: readonly CandidateItem[];
  /** Set for active recall: the term the reader's history produced is the topic, not the
   * channel that happened to answer the query. Left out for ordinary polling. */
  topicLabel?: string;
  /** Recall aimed at what the reader already reads; polling brings whatever the world
   * published. The column predates external content and keeps its spec 051 meaning. */
  source?: DiscoveryCardRow["source"];
}

function clipHook(summary: string): string {
  const oneLine = summary.replace(/\s+/g, " ").trim();
  if (oneLine.length <= HOOK_CHARACTER_CAP) return oneLine;
  return `${oneLine.slice(0, HOOK_CHARACTER_CAP).trimEnd()}…`;
}

/**
 * A source the shipped catalog does not know is one the reader added themselves, and its id
 * carries the address they pasted in (`user-feed:https://…`). The settings page already lists
 * those under their hostname, so their cards are filed under the same hostname: a topic label is
 * read by people, ranked on, and — until spec 053 T9 finding #1 — sent to third-party search APIs
 * as a query, none of which an address is fit for.
 */
function topicLabelForUnknownSource(sourceId: string): string {
  const pastedAddress = feedUrlFromUserFeedSourceId(sourceId);
  return (
    (pastedAddress === null ? null : feedHostLabel(pastedAddress)) ??
    // An id that is an address on its own gets the same treatment; one that is a plain name
    // (a catalog entry this build no longer ships) is already readable.
    feedHostLabel(sourceId) ??
    sourceId
  );
}

/** arXiv's catalog entries are per category ("arXiv Machine Learning (cs.LG)"), and the
 * category is the interesting part: a reader is interested in machine-learning papers, not in
 * arXiv. Every other channel is its own topic. */
export function topicLabelForSource(
  source: ChannelSource | undefined,
  item: CandidateItem,
): string {
  if (source === undefined) return topicLabelForUnknownSource(item.sourceId);
  if (source.adapterType === "arxiv") {
    return source.displayName.replace(/^arXiv\s+/i, "").trim() || source.displayName;
  }
  return source.displayName;
}

export function cardRowFromCandidate(
  item: CandidateItem,
  topicLabel: string,
  cardSource: DiscoveryCardRow["source"],
  batchId: string,
  createdAt: string,
): DiscoveryCardRow {
  return {
    id: item.id,
    title: item.title,
    hook: clipHook(item.summary),
    topic_label: topicLabel,
    source: cardSource,
    // Self-generated bodies belong to the retired pipeline; external items are read from the
    // source itself (spec 053 §7, the UI wave), so this stays null.
    body_md: null,
    embedding_json: null,
    batch_id: batchId,
    created_at: createdAt,
    opened_at: null,
    source_id: item.sourceId,
    kind: item.kind,
    url: item.url,
    media_url: item.mediaUrl,
    cover_url: item.coverUrl,
    author: item.author,
    published_at: item.publishedAt,
    saved_at: null,
    quality_score: null,
    upstream_signal: item.upstreamSignal,
  };
}

/**
 * Inserts everything the pool does not already hold and returns just the rows that were new.
 * Idempotent by card id: an item already in the pool is left exactly as it is, keeping whatever
 * the reader has done with it (opened, saved, disliked) and whatever the background passes have
 * since computed for it.
 */
export async function landCandidateItems(
  groups: readonly CandidateGroup[],
  nowIso: string,
): Promise<DiscoveryCardRow[]> {
  const repos = await getRepos();
  const known = new Set(await repos.discovery.listCardIds());
  const sourcesById = new Map(
    loadStarterChannelCatalog().sources.map((source) => [source.id, source]),
  );
  const batchId = newId();
  const rows: DiscoveryCardRow[] = [];

  for (const group of groups) {
    for (const item of group.items) {
      if (known.has(item.id)) continue;
      known.add(item.id);
      const topicLabel =
        group.topicLabel ?? topicLabelForSource(sourcesById.get(item.sourceId), item);
      rows.push(cardRowFromCandidate(item, topicLabel, group.source ?? "explore", batchId, nowIso));
    }
  }

  if (rows.length > 0) await repos.discovery.insertCards(rows);
  return rows;
}
