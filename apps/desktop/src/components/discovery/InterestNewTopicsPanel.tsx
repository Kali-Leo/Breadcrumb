/**
 * Purpose: topics that carry a much bigger share of the last weeks than of the long run,
 * each with the three most recent things opened under it.
 * Main exports: InterestNewTopicsPanel.
 */
import { videoUrl } from "@breadcrumb/plugin-browsing-interest";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { useBrowsingInterestStore } from "../../stores/browsingInterestStore";
import { InterestPanel, InterestPanelEmptyLine } from "./InterestPanel";

export function InterestNewTopicsPanel() {
  const { t } = useTranslation("discovery");
  const newInterests = useBrowsingInterestStore((state) => state.newInterests);
  const interests = newInterests?.interests ?? [];

  return (
    <InterestPanel title={t("newTopics.title")}>
      {interests.length === 0 ? (
        <InterestPanelEmptyLine>{t("newTopics.empty")}</InterestPanelEmptyLine>
      ) : (
        <ul className="divide-y divide-stone-100">
          {interests.map((interest) => (
            <li key={interest.topic} className="py-2">
              <span className="font-semibold text-sm text-stone-700">{interest.topic}</span>
              <span className="ms-2 font-semibold text-blue-600 text-xs">
                {(interest.share * 100).toFixed(0)}%↑
              </span>
              {interest.items.length > 0 && (
                <div className="mt-1 text-stone-400 text-xs">
                  {interest.items.map((item, index) => {
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
