/**
 * Purpose: the three-step switch that says how big the discovery feed draws its cards (spec 054
 * §(b), Leo 2026-08-18 「加一个允许用户调节大小挡位的switch」). Three segments, all three named,
 * the chosen one amber — the same pill the map's 休闲｜目标 switch, the composer's 学习模式 switch
 * and the feed's 熟悉｜新领域 switch use (spec 052's ruling), with one more segment.
 *
 * It lives on the settings page rather than over the feed: the feed's own header already carries
 * the 熟悉｜新领域 switch and the way into 收藏, and this is a preference someone sets once for
 * their monitor rather than a control they reach for while reading.
 * Main exports: DiscoveryCardSizeSwitch.
 */
import type { DiscoveryCardSize } from "../lib/discoveryFeedGrid";
import { useSettingsStore } from "../stores/settingsStore";

export const CARD_SIZE_EXPLANATION = "发现页里每张卡片画多大。卡片小一些，一屏就能看到更多。";

const SEGMENTS: readonly (readonly [DiscoveryCardSize, string, string])[] = [
  ["small", "小", "一屏看到更多，每张小一些"],
  ["medium", "中", "默认的大小"],
  ["large", "大", "每张大一些，一屏看到的少一些"],
];

export function DiscoveryCardSizeSwitch() {
  const cardSize = useSettingsStore((state) => state.discoveryCardSize);

  return (
    // A fieldset, not a plain div: three buttons reading 小 / 中 / 大 tell a screen reader nothing
    // on their own, and this is the standard way to say what they are choosing between.
    <fieldset
      aria-label="卡片大小"
      className="inline-flex overflow-hidden rounded-full border border-stone-300 bg-white text-xs shadow-sm"
    >
      {SEGMENTS.map(([size, label, hint]) => (
        <button
          key={size}
          type="button"
          aria-pressed={cardSize === size}
          title={hint}
          onClick={() => {
            if (size !== cardSize) void useSettingsStore.getState().setDiscoveryCardSize(size);
          }}
          className={`px-4 py-1 transition-colors ${
            cardSize === size ? "bg-amber-500 text-white" : "text-stone-500 hover:bg-stone-50"
          }`}
        >
          {label}
        </button>
      ))}
    </fieldset>
  );
}
