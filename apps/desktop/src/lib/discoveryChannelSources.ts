/**
 * Purpose: turns the reader's source settings (spec 053 §8) into the list of channel sources one
 * polling round may use — the shipped catalog minus what they switched off, the 豆瓣 template
 * entry once they have supplied an id, and the RSS addresses they pasted in themselves. Pure
 * list building over the static catalog: no network, no DB. Channels publishing in a language the
 * reader does not read are left out here too (spec 054), so they cost no request at all.
 * Main exports: buildEnabledChannelSources, listCatalogChannelChoices, userFeedSourceId.
 */
import {
  type ChannelSource,
  channelSourceSchema,
  fillSourceTemplate,
  isSourceTemplate,
  loadStarterChannelCatalog,
} from "@breadcrumb/plugin-channels";
import { z } from "zod";
import { channelSourcePassesLanguageFilter } from "./discoveryLanguageFilter";
import { type FeedLanguage, resolveFeedLanguagePolicy } from "./discoveryLanguages";

/** What the settings page needs to know about a source, and nothing more. */
export interface CatalogChannelChoice {
  id: string;
  displayName: string;
  /** True for the 豆瓣 entry, which does nothing until the reader supplies their id — the
   * settings page lists it under its own input rather than as a plain switch. */
  needsUserInput: boolean;
  defaultEnabled: boolean;
}

export interface ChannelSourceSelection {
  /** Only the channels the reader actually switched; everything else follows defaultEnabled. */
  channelEnabledById: Readonly<Record<string, boolean>>;
  userFeedUrls: readonly string[];
  doubanUserId: string;
  /** The language the first-run panel wrote, and the ones the language settings added. Null
   * before the reader has been asked; resolveFeedLanguagePolicy fills in the default. */
  feedLanguage: FeedLanguage | null;
  additionalFeedLanguages: readonly FeedLanguage[];
  /** Spec 054's seventh point, whose own switch is a task of its own; absent means on. */
  academicContentEnabled?: boolean;
}

/** Ids of self-added feeds carry their address, so the same feed added twice is the same
 * channel — and its fetch state (validators, budget, backoff) survives a remove and re-add. */
const USER_FEED_ID_PREFIX = "user-feed:";

export function userFeedSourceId(feedUrl: string): string {
  return `${USER_FEED_ID_PREFIX}${feedUrl}`;
}

/** The address behind a self-added source id, or null when the id is a catalog one. */
export function feedUrlFromUserFeedSourceId(sourceId: string): string | null {
  if (!sourceId.startsWith(USER_FEED_ID_PREFIX)) return null;
  return sourceId.slice(USER_FEED_ID_PREFIX.length);
}

/** Half-hourly at most, forty-eight requests a day — the same restraint the catalog's own blog
 * feeds are held to, since a pasted address is usually one of those. */
const USER_FEED_POLICY = {
  minimumIntervalMilliseconds: 1_800_000,
  dailyRequestBudget: 48,
  userAgentOverride: null,
} as const;

/** The hostname a feed address is shown under: what the settings page lists a self-added source
 * as, and what its cards are filed under. Null when the address is not usable as one. */
export function feedHostLabel(feedUrl: string): string | null {
  try {
    return new URL(feedUrl).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

function hostLabel(feedUrl: string): string {
  return feedHostLabel(feedUrl) ?? feedUrl;
}

/** A pasted address as a channel source, or null when it is not a usable address — a bad line
 * in storage costs the reader nothing but that one feed. */
export function userFeedSource(feedUrl: string): ChannelSource | null {
  if (!z.url().safeParse(feedUrl).success) return null;
  const parsed = channelSourceSchema.safeParse({
    id: userFeedSourceId(feedUrl),
    displayName: hostLabel(feedUrl),
    adapterType: "generic-feed",
    endpoint: { feedUrl },
    // The address alone says nothing about the language, and nothing downstream needs it to.
    language: "und",
    defaultKind: "article",
    defaultEnabled: true,
    fetchPolicy: USER_FEED_POLICY,
  });
  return parsed.success ? parsed.data : null;
}

/** The 豆瓣 entry's blank is the reader's user id; a template asking for anything else is one
 * this build has no input for, so it stays out of the round rather than being half-filled. */
function filledTemplateSource(source: ChannelSource, doubanUserId: string): ChannelSource | null {
  const parameters = source.templateParameters ?? [];
  if (doubanUserId === "" || parameters.some((parameter) => parameter.name !== "userId")) {
    return null;
  }
  try {
    return fillSourceTemplate(source, { userId: doubanUserId });
  } catch {
    return null;
  }
}

/**
 * The sources one polling round may use. A source is in when the reader switched it on, or when
 * they never touched it and the catalog says a fresh install polls it — and, either way, when it
 * publishes in a language the reader reads (spec 054). A channel they switched on by hand keeps
 * running whatever it publishes in: a switch that does nothing is worse than a stray card.
 */
export function buildEnabledChannelSources(
  selection: ChannelSourceSelection,
): readonly ChannelSource[] {
  const sources: ChannelSource[] = [];
  const doubanUserId = selection.doubanUserId.trim();
  const policy = resolveFeedLanguagePolicy(selection);
  const speaksToReader = (source: ChannelSource): boolean =>
    channelSourcePassesLanguageFilter(source, policy);

  for (const source of loadStarterChannelCatalog().sources) {
    const enabled = selection.channelEnabledById[source.id] ?? source.defaultEnabled;
    if (isSourceTemplate(source)) {
      // Supplying the id is itself the switch — a reader who typed it in wants it read, unless
      // they went on to switch it off.
      if (selection.channelEnabledById[source.id] === false) continue;
      const filled = filledTemplateSource(source, doubanUserId);
      if (filled !== null && speaksToReader(filled)) sources.push(filled);
      continue;
    }
    if (enabled && speaksToReader(source)) sources.push(source);
  }

  const seenIds = new Set(sources.map((source) => source.id));
  for (const feedUrl of selection.userFeedUrls) {
    const source = userFeedSource(feedUrl);
    if (source === null || seenIds.has(source.id)) continue;
    if (selection.channelEnabledById[source.id] === false) continue;
    seenIds.add(source.id);
    sources.push(source);
  }
  return sources;
}

/** The catalog as the settings page lists it, in catalog order. */
export function listCatalogChannelChoices(): readonly CatalogChannelChoice[] {
  return loadStarterChannelCatalog().sources.map((source) => ({
    id: source.id,
    displayName: source.displayName,
    needsUserInput: isSourceTemplate(source),
    defaultEnabled: source.defaultEnabled,
  }));
}
