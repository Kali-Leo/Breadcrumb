/**
 * Purpose: topics that carry a much bigger share of the last weeks than of the long run,
 * each with the three most recent things opened under it.
 * Main exports: InterestNewTopicsPanel.
 */
import { formatPercent } from "@breadcrumb/core-i18n";
import { videoUrl } from "@breadcrumb/plugin-browsing-interest";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { useBrowsingInterestStore } from "../../stores/browsingInterestStore";
import { InterestPanel, InterestPanelEmptyLine } from "./InterestPanel";
import { useTopicName } from "./topicNames";

/** With little data behind the shares, a single click can crown a "new interest", so the
 * list gets a softening line (2026-08-28 audit #10). Engaged events (clicks/watches) are the
 * honest yardstick — n_events counts scrolling too and inflates fast (2026-08-30 review);
 * the raw-count threshold only backstops older service builds without n_engaged. Both
 * numbers are provisional product choices. */
const THIN_EVIDENCE_ENGAGED_COUNT = 200;
const THIN_EVIDENCE_EVENT_COUNT = 500;

/** The service lists a topic's last three engaged events — one video clicked and then
 * watched arrives twice, which both duplicated the line on screen and collided React keys
 * (the key is id+title). Display each video once. */
function uniqueItems<Item extends { id: string; title: string }>(items: readonly Item[]): Item[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.id}-${item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function InterestNewTopicsPanel() {
  const { t, i18n } = useTranslation("discovery");
  const topicName = useTopicName();
  const newInterests = useBrowsingInterestStore((state) => state.newInterests);
  const engagedCount = useBrowsingInterestStore((state) => state.profile?.n_engaged);
  const eventCount = useBrowsingInterestStore((state) => state.profile?.n_events ?? 0);
  const interests = newInterests?.interests ?? [];
  const evidenceThin =
    engagedCount !== undefined
      ? engagedCount < THIN_EVIDENCE_ENGAGED_COUNT
      : eventCount < THIN_EVIDENCE_EVENT_COUNT;

  return (
    <InterestPanel title={t("newTopics.title")}>
      {interests.length > 0 && evidenceThin && (
        <p className="mb-1 text-stone-400 text-xs">{t("newTopics.thinEvidence")}</p>
      )}
      {interests.length === 0 ? (
        <InterestPanelEmptyLine>{t("newTopics.empty")}</InterestPanelEmptyLine>
      ) : (
        <ul className="divide-y divide-stone-100">
          {interests.map((interest) => (
            <li key={interest.topic} className="py-2">
              <span className="font-semibold text-sm text-stone-700">
                {topicName(interest.topic, interest.topic_en)}
              </span>
              <span className="ms-2 font-semibold text-blue-600 text-xs">
                {formatPercent(i18n.language, interest.share)}↑
              </span>
              {interest.items.length > 0 && (
                <div className="mt-1 text-stone-400 text-xs">
                  {uniqueItems(interest.items).map((item, index) => {
                    const url = videoUrl(item.site, item.id);
                    return (
                      <span key={`${item.id}-${item.title}`}>
                        {index > 0 && " · "}
                        {url ? (
                          <button
                            type="button"
                            onClick={() => void openUrl(url)}
                            className="text-blue-700 hover:underline"
                          >
                            {item.title}
                          </button>
                        ) : (
                          item.title
                        )}
                      </span>
                    );
                  })}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </InterestPanel>
  );
}
