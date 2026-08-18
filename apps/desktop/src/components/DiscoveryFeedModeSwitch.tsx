/**
 * Purpose: the switch above the feed that says which of the two moods the reader is in
 * (spec 054, Leo's eighth point). Two segments, both named, the chosen one amber — the same pill
 * the map's 休闲｜目标 switch and the composer's 学习模式 switch use (spec 052's ruling). Moving it
 * replaces what the grid is showing, because the reader who just said "not this" should not have
 * to scroll past what they said it about.
 * Main exports: DiscoveryFeedModeSwitch.
 */

import { FEED_MODE_CHOICES, type FeedMode } from "../lib/discoveryFeedMode";
import { useDiscoveryChannelSettingsStore } from "../stores/discoveryChannelSettingsStore";
import { useDiscoveryStore } from "../stores/discoveryStore";

export function DiscoveryFeedModeSwitch() {
  const mode = useDiscoveryChannelSettingsStore((state) => state.feedMode);

  async function switchTo(next: FeedMode): Promise<void> {
    if (next === mode) return;
    await useDiscoveryChannelSettingsStore.getState().setFeedMode(next);
    await useDiscoveryStore.getState().redrawFeed();
  }

  return (
    <div className="inline-flex overflow-hidden rounded-full border border-stone-300 bg-white text-xs shadow-sm">
      {FEED_MODE_CHOICES.map((choice) => (
        <button
          key={choice.mode}
          type="button"
          aria-pressed={mode === choice.mode}
          title={choice.hint}
          onClick={() => void switchTo(choice.mode)}
          className={`px-3 py-1 transition-colors ${
            mode === choice.mode ? "bg-amber-500 text-white" : "text-stone-500 hover:bg-stone-50"
          }`}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}
