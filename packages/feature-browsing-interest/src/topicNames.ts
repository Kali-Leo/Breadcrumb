/**
 * Purpose: the interest service names topics in Chinese and may send an English list beside
 * it (`topics_en`, aligned by position with `topics`). This turns that into a lookup the
 * panels can use, and answers every lookup with *some* readable name: a missing translation
 * shows the original topic rather than a blank.
 * Main exports: englishTopicNames, topicLabel.
 */
import type { BrowsingProfile } from "./schemas";

/** Chinese topic name → English name, for the pairs the service actually provided. */
export function englishTopicNames(profile: BrowsingProfile | null): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  const english = profile?.topics_en;
  if (profile === null || english === undefined) return names;
  profile.topics.forEach((topic, index) => {
    const name = english[index];
    if (name !== undefined && name.trim() !== "") names.set(topic, name);
  });
  return names;
}

/**
 * The topic name to show. `ownEnglishName` is the entry's own `topic_en` where the response
 * carries one; the profile-wide map is the fallback, and the original topic the last resort.
 */
export function topicLabel(
  topic: string,
  options: {
    preferEnglish: boolean;
    englishNames?: ReadonlyMap<string, string>;
    ownEnglishName?: string | undefined;
  },
): string {
  if (!options.preferEnglish) return topic;
  const own = options.ownEnglishName;
  if (own !== undefined && own.trim() !== "") return own;
  return options.englishNames?.get(topic) ?? topic;
}
