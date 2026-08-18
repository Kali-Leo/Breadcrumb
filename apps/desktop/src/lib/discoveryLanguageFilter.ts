/**
 * Purpose: the two places the reader's language choice is applied (spec 054, Leo's second point).
 * A channel is only worth a request when it publishes in a language the reader reads, and a card
 * that landed anyway is only worth a place on the grid when its own words are in one — a channel's
 * declared language describes the channel, not every item in it. Papers are outside both checks:
 * Leo's seventh point exempts academic content from the language filter.
 * Pure predicates over rows and catalog entries: no network, no DB, no settings read.
 * Main exports: channelSourcePassesLanguageFilter, cardPassesLanguageFilter, ACADEMIC_CARD_KIND.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import type { ChannelSource } from "@breadcrumb/plugin-channels";
import { detectTextLanguage } from "./discoveryLanguageDetection";
import type { FeedLanguage, FeedLanguagePolicy } from "./discoveryLanguages";

/** Papers are the academic material Leo's seventh point is about; the catalog's arXiv entries
 * declare it as their kind and every card off them carries it. */
export const ACADEMIC_CARD_KIND = "paper";

/** The catalog writes BCP 47 tags ("zh-CN", "en"); the reader's setting is the language, not the
 * region. Anything the feed cannot be set to comes back null and is treated as not enabled. */
function feedLanguageOfTag(tag: string): FeedLanguage | null {
  const base = tag.toLowerCase().split("-")[0] ?? "";
  if (base === "zh") return "zh";
  if (base === "en") return "en";
  return null;
}

/** A source that belongs to no language of its own — the feeds the reader pasted in themselves,
 * and the search-only channels whose language is whatever was typed at them. */
function hasNoLanguageOfItsOwn(source: ChannelSource): boolean {
  return source.language.toLowerCase() === "und";
}

/**
 * Whether this channel may be polled at all. Three ways past the language check, in the order the
 * two filters both apply them: it publishes papers, which reach every reader and are the academic
 * switch's business alone (Leo's seventh point — an academic reader is not served by hiding
 * English work); the reader asked for this channel by hand; or the channel has no language of its
 * own, because they pasted its address in themselves.
 */
export function channelSourcePassesLanguageFilter(
  source: ChannelSource,
  policy: FeedLanguagePolicy,
): boolean {
  if (source.defaultKind === ACADEMIC_CARD_KIND) return policy.academicContentEnabled;
  if (policy.readerChosenSourceIds.includes(source.id)) return true;
  if (hasNoLanguageOfItsOwn(source)) return true;
  const language = feedLanguageOfTag(source.language);
  return language !== null && policy.enabledLanguages.includes(language);
}

/** What the detector is given: the two pieces of the card the reader actually reads on the grid.
 * The body is left out — external cards have none until they are opened, so using it would judge
 * opened and unopened cards by different evidence. */
function readableTextOf(card: Pick<DiscoveryCardRow, "title" | "hook">): string {
  return `${card.title} ${card.hook}`;
}

/**
 * Whether this card may be shown. The same three ways past the check as its channel had, so a
 * channel that was worth polling is never polled and then thrown away. A card whose words the
 * detector cannot read confidently is kept: a stray now and then costs less than dropping
 * something the reader wanted (spec 054's standing ruling that a thin feed is acceptable, an
 * over-filtered one is not).
 */
export function cardPassesLanguageFilter(
  card: Pick<DiscoveryCardRow, "title" | "hook" | "kind" | "source_id">,
  policy: FeedLanguagePolicy,
): boolean {
  if (card.kind === ACADEMIC_CARD_KIND) return policy.academicContentEnabled;
  if (card.source_id !== null && policy.readerChosenSourceIds.includes(card.source_id)) return true;
  const detected = detectTextLanguage(readableTextOf(card));
  if (detected === null) return true;
  if (detected === "chinese") return policy.enabledLanguages.includes("zh");
  if (detected === "english") return policy.enabledLanguages.includes("en");
  // Japanese, Korean and the other scripts are not languages the feed can be set to, so a card
  // clearly written in one is a stray whatever the reader chose.
  return false;
}
