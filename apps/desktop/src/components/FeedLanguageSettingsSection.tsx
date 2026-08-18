/**
 * Purpose: the language settings' say over the discovery feed (spec 054, Leo's second point) —
 * the reader chose one language when the feed first opened, and this is where they let another
 * one back in. Lives on the 语言学习 page because that is the page Leo named for it.
 * Main exports: FeedLanguageSettingsSection.
 */
import { useEffect } from "react";
import {
  defaultFeedLanguage,
  FEED_LANGUAGE_CHOICES,
  type FeedLanguage,
  feedLanguageLabel,
  resolveFeedLanguagePolicy,
} from "../lib/discoveryLanguages";
import { useDiscoveryChannelSettingsStore } from "../stores/discoveryChannelSettingsStore";
import { useDiscoveryStore } from "../stores/discoveryStore";

export const FEED_LANGUAGE_SETTINGS_TITLE = "发现页的语言";
export const FEED_LANGUAGE_SETTINGS_HINT =
  "打开一种语言，发现页里也会出现这种语言的文章、视频和播客。";

export function feedLanguageStatusLine(chosen: FeedLanguage): string {
  return `发现页现在显示${feedLanguageLabel(chosen)}。`;
}

function ToggleSwitch({
  on,
  ariaLabel,
  onClick,
}: {
  on: boolean;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={on}
      onClick={onClick}
      className={`h-7 w-13 shrink-0 rounded-full p-0.5 transition-colors ${on ? "bg-amber-500" : "bg-stone-300"}`}
    >
      <span
        className={`block h-6 w-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-6" : "translate-x-0"}`}
      />
    </button>
  );
}

export function FeedLanguageSettingsSection() {
  const loaded = useDiscoveryChannelSettingsStore((state) => state.loaded);
  const feedLanguage = useDiscoveryChannelSettingsStore((state) => state.feedLanguage);
  const additional = useDiscoveryChannelSettingsStore((state) => state.additionalFeedLanguages);

  useEffect(() => {
    if (!loaded) void useDiscoveryChannelSettingsStore.getState().loadFromDatabase();
  }, [loaded]);

  const policy = resolveFeedLanguagePolicy({
    feedLanguage,
    additionalFeedLanguages: additional,
  });
  // The language chosen at first run is always on, so it is stated rather than offered as a
  // switch that cannot be moved; the rest are the ones there is a decision to make about.
  const chosen = feedLanguage ?? defaultFeedLanguage();
  const others = FEED_LANGUAGE_CHOICES.filter((choice) => choice.language !== chosen);

  async function toggle(language: FeedLanguage, enabled: boolean): Promise<void> {
    await useDiscoveryChannelSettingsStore
      .getState()
      .setAdditionalFeedLanguageEnabled(language, enabled);
    // The feed is another page, and it keeps its cards while the reader is away. Re-ranking what
    // they have not reached yet is what makes the switch visible when they go back; the cards
    // already scrolled past keep their places, as they do after any other re-rank.
    await useDiscoveryStore.getState().reshapeUpcoming();
  }

  return (
    <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
      <div>
        <h3 className="font-medium text-stone-700">{FEED_LANGUAGE_SETTINGS_TITLE}</h3>
        <p className="text-xs text-stone-400">
          {feedLanguageStatusLine(chosen)}
          {FEED_LANGUAGE_SETTINGS_HINT}
        </p>
      </div>
      <div className="space-y-3 text-sm text-stone-600">
        {others.map((choice) => (
          <div key={choice.language} className="flex items-center justify-between gap-4">
            <span>{choice.label}</span>
            <ToggleSwitch
              on={policy.enabledLanguages.includes(choice.language)}
              ariaLabel={`发现页显示${choice.label}`}
              onClick={() =>
                void toggle(choice.language, !policy.enabledLanguages.includes(choice.language))
              }
            />
          </div>
        ))}
      </div>
    </section>
  );
}
