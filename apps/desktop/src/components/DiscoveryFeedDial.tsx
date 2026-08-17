/**
 * Purpose: the switch above the feed that says how much of it should be territory the reader has
 * no history with (spec 053 §6). Two segments, both named, the chosen one amber — the same pill
 * the map's 休闲｜目标 switch and the composer's 学习模式 switch use (spec 052's ruling).
 * Main exports: DiscoveryFeedDial.
 */

import { recordFeedDialMove } from "../lib/discoveryFeedbackEvents";
import {
  dialPositionForShare,
  type FeedDialPosition,
  shareForDialPosition,
} from "../lib/discoveryFeedDial";
import { useDiscoveryStore } from "../stores/discoveryStore";
import { useSettingsStore } from "../stores/settingsStore";

const SEGMENTS: readonly (readonly [FeedDialPosition, string, string])[] = [
  ["familiar", "熟悉的多一点", "多给你已经在看的方面"],
  ["new-fields", "新领域多一点", "多给你还没怎么接触过的方面"],
];

export function DiscoveryFeedDial() {
  const explorationShare = useSettingsStore((state) => state.discoveryExplorationShare);
  const position = dialPositionForShare(explorationShare);

  async function moveTo(next: FeedDialPosition): Promise<void> {
    if (next === position) return;
    const share = shareForDialPosition(next);
    await useSettingsStore.getState().setDiscoveryExplorationShare(share);
    await recordFeedDialMove(share);
    // Re-ranks everything the reader has not reached yet — the cards below the fold change on
    // the spot, the ones already looked at stay where they are (spec 053 验收).
    await useDiscoveryStore.getState().reshapeUpcoming();
  }

  // Same wrapper as the map's 休闲｜目标 pill: the two buttons name themselves and carry
  // aria-pressed, so the group needs no label of its own.
  return (
    <div className="inline-flex overflow-hidden rounded-full border border-stone-300 bg-white text-xs shadow-sm">
      {SEGMENTS.map(([segment, label, hint]) => (
        <button
          key={segment}
          type="button"
          aria-pressed={position === segment}
          title={hint}
          onClick={() => void moveTo(segment)}
          className={`px-3 py-1 transition-colors ${
            position === segment ? "bg-amber-500 text-white" : "text-stone-500 hover:bg-stone-50"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
