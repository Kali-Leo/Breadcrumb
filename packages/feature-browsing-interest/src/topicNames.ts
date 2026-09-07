/**
 * Purpose: the topic names the classifier works in are Chinese, because the taxonomy's order is
 * the weight matrix's column order and cannot be renamed. This answers "what should the panel
 * show" for one topic, and answers it with *some* readable name: a topic with no translation
 * shows its original name rather than a blank.
 * Main exports: englishTopicNames, topicLabel.
 */
import type { BrowsingProfile } from "./schemas";
import { TOPIC_GROUP_NAMES_EN, TOPIC_LEAF_NAMES_EN } from "./taxonomy";

/** Chinese topic name → English name, for whatever pairs a profile carries itself. */
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
 * The topic name to show, in order of authority: the entry's own English name, then whatever
 * the profile carried, then the taxonomy's own English tables — leaves and groups both, because
 * a panel labels items by leaf and chips by group and either can reach here. The original
 * Chinese name is the last resort, so a topic never renders blank.
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
  return (
    options.englishNames?.get(topic) ??
    TOPIC_LEAF_NAMES_EN[topic] ??
    TOPIC_GROUP_NAMES_EN[topic] ??
    topic
  );
}
