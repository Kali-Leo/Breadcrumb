/**
 * Purpose: turns the reader's source settings (spec 053 §8) into the list of channel sources one
 * polling round may use — the shipped catalog minus what they switched off, the 豆瓣 template
 * entry once they have supplied an id, and the RSS addresses they pasted in themselves. Pure
 * list building over the static catalog: no network, no DB.
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
}

/** Ids of self-added feeds carry their address, so the same feed added twice is the same
 * channel — and its fetch state (validators, budget, backoff) survives a remove and re-add. */
const USER_FEED_ID_PREFIX = "user-feed:";

export function userFeedSourceId(feedUrl: string): string {
  return `${USER_FEED_ID_PREFIX}${feedUrl}`;
}

/** Half-hourly at most, forty-eight requests a day — the same restraint the catalog's own blog
 * feeds are held to, since a pasted address is usually one of those. */
const USER_FEED_POLICY = {
  minimumIntervalMilliseconds: 1_800_000,
  dailyRequestBudget: 48,
  userAgentOverride: null,
} as const;

function hostLabel(feedUrl: string): string {
  try {
    return new URL(feedUrl).hostname.replace(/^www\./, "") || feedUrl;
  } catch {
    return feedUrl;
  }
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
 * they never touched it and the catalog says a fresh install polls it.
 */
export function buildEnabledChannelSources(
  selection: ChannelSourceSelection,
): readonly ChannelSource[] {
  const sources: ChannelSource[] = [];
  const doubanUserId = selection.doubanUserId.trim();

  for (const source of loadStarterChannelCatalog().sources) {
    const enabled = selection.channelEnabledById[source.id] ?? source.defaultEnabled;
    if (isSourceTemplate(source)) {
      // Supplying the id is itself the switch — a reader who typed it in wants it read, unless
      // they went on to switch it off.
      if (selection.channelEnabledById[source.id] === false) continue;
      const filled = filledTemplateSource(source, doubanUserId);
      if (filled !== null) sources.push(filled);
      continue;
    }
    if (enabled) sources.push(source);
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
