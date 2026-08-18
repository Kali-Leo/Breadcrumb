/**
 * Purpose: the feed's two modes (spec 054, Leo's eighth point — 「应该有休闲和专业两个模式，用户想放松
 * 的时候会非常不想看到专业内容，想阅读专业内容时会非常讨厌休闲内容」). Both halves of that sentence are
 * absolute, so this is a filter and not a weighting: in 休闲 the professional sources are gone, in
 * 专业 the casual ones are. What keeps either mode from emptying out is the catalog's third answer,
 * "both", which every source that genuinely serves either mood carries.
 * Pure over rows and the static catalog: no network, no DB, no settings read.
 * Main exports: FeedMode, feedModeSchema, FEED_MODE_CHOICES, DEFAULT_FEED_MODE,
 * resolveFeedModePolicy, cardPassesModeFilter, FeedModePolicy.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { type ChannelTone, loadStarterChannelCatalog } from "@breadcrumb/plugin-channels";
import { z } from "zod";

export const feedModeSchema = z.enum(["casual", "professional"]);

export type FeedMode = z.infer<typeof feedModeSchema>;

export interface FeedModeChoice {
  readonly mode: FeedMode;
  readonly label: string;
  /** Sits in the segment's tooltip, next to the name rather than inside it: the name is the word
   * Leo used, and what it does to the feed is said in a full sentence beside it. */
  readonly hint: string;
}

export const FEED_MODE_CHOICES: readonly FeedModeChoice[] = [
  { mode: "casual", label: "休闲", hint: "放松时看的内容，不出现专业内容" },
  { mode: "professional", label: "专业", hint: "专业读者看的内容，不出现休闲内容" },
];

/** Someone opening a discovery feed for the first time is browsing, not working — and of the two
 * wrong answers, showing a browsing reader trade publications is the more jarring one. */
export const DEFAULT_FEED_MODE: FeedMode = "casual";

export interface FeedModePolicy {
  readonly mode: FeedMode;
  /**
   * Channels the reader went into the source settings and switched on by hand — exempt here for
   * the same reason the language filter exempts them: they asked for this channel, and a switch
   * whose cards never arrive is worse than a card that does not match the mood.
   */
  readonly readerChosenSourceIds: readonly string[];
}

export interface StoredFeedModeSettings {
  readonly feedMode?: FeedMode;
  readonly channelEnabledById?: Readonly<Record<string, boolean>>;
}

export function resolveFeedModePolicy(settings: StoredFeedModeSettings): FeedModePolicy {
  const switches = settings.channelEnabledById ?? {};
  return {
    mode: settings.feedMode ?? DEFAULT_FEED_MODE,
    readerChosenSourceIds: Object.keys(switches).filter((id) => switches[id] === true),
  };
}

/** Built once from the shipped catalog: the grid asks this of every pooled card on every pass. */
let toneBySourceId: Map<string, ChannelTone> | null = null;

function toneOfSource(sourceId: string): ChannelTone {
  toneBySourceId ??= new Map(
    loadStarterChannelCatalog().sources.map((source) => [source.id, source.tone]),
  );
  // A card off a feed the reader pasted in, or off a source a later catalog dropped, belongs to
  // no mode of its own — it is shown in both rather than hidden from one.
  return toneBySourceId.get(sourceId) ?? "both";
}

/** Whether this card belongs in the mode the reader is in. */
export function cardPassesModeFilter(
  card: Pick<DiscoveryCardRow, "source_id">,
  policy: FeedModePolicy,
): boolean {
  if (card.source_id === null) return true;
  if (policy.readerChosenSourceIds.includes(card.source_id)) return true;
  const tone = toneOfSource(card.source_id);
  return tone === "both" || tone === policy.mode;
}
