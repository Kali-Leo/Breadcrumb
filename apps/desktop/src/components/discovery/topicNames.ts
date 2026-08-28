/**
 * Purpose: the interest service names topics in Chinese. When the interface is in English and
 * the service supplied English names (`topics_en`, or an entry's own `topic_en`), the panels
 * show those instead; anything it has no English name for keeps its original name rather than
 * disappearing. One hook so every interest panel answers this the same way.
 * Main exports: useTopicName.
 */
import { englishTopicNames, topicLabel } from "@breadcrumb/plugin-browsing-interest";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useBrowsingInterestStore } from "../../stores/browsingInterestStore";

export function useTopicName(): (topic: string, ownEnglishName?: string) => string {
  const { i18n } = useTranslation();
  const profile = useBrowsingInterestStore((state) => state.profile);
  const englishNames = useMemo(() => englishTopicNames(profile), [profile]);
  const preferEnglish = i18n.language.startsWith("en");
  return (topic, ownEnglishName) =>
    topicLabel(topic, { preferEnglish, englishNames, ownEnglishName });
}
