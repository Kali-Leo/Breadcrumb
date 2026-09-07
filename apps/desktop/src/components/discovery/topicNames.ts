/**
 * Purpose: topics are classified under Chinese names. When the interface is in English the
 * panels show the English name instead; anything with no English name keeps its original name
 * rather than disappearing. One hook so every interest panel answers this the same way.
 * Main exports: useTopicName.
 */
import { englishTopicNames, topicLabel } from "@breadcrumb/feature-browsing-interest";
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
