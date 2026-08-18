/**
 * Purpose: the one screen the discovery feed opens with the first time (spec 053 §6) — what this
 * page is, in sentences someone who has never seen the app can follow, and a dozen broad fields
 * to take a position on. Positions are a starting point, not a filter: they seed the first
 * fetches and are outweighed by real reading within a week (see interestModel).
 * Main exports: DiscoveryOnboarding.
 */
import { useState } from "react";
import { recordOnboardingStances } from "../lib/discoveryFeedbackEvents";
import {
  nextStance,
  ONBOARDING_FIELDS,
  type OnboardingStance,
  stanceLabel,
} from "../lib/discoveryOnboarding";
import { useDiscoveryChannelSettingsStore } from "../stores/discoveryChannelSettingsStore";
import { useDiscoveryStore } from "../stores/discoveryStore";

const INTRO =
  "发现页会从公开的网站上找文章、视频和播客给你翻。先说说你大致想看哪些方面，第一批内容就有个方向；之后你翻什么、收藏什么，它会跟着一起变。";
const CYCLE_HINT = "点一下是想看，再点是不想看，第三下回到一般。没想法的放着不动就行。";

const CHIP_STYLES: Readonly<Record<OnboardingStance, string>> = {
  neutral: "border-stone-300 bg-white text-stone-600 hover:bg-stone-50",
  want: "border-amber-500 bg-amber-500 text-white",
  avoid: "border-stone-200 bg-stone-100 text-stone-400 line-through",
};

interface DiscoveryOnboardingProps {
  /** Called once the panel is done with — answered or skipped; the feed takes over from here. */
  onDone(): void;
}

export function DiscoveryOnboarding({ onDone }: DiscoveryOnboardingProps) {
  const [stances, setStances] = useState<Readonly<Record<string, OnboardingStance>>>({});
  const [working, setWorking] = useState(false);

  function cycle(field: string): void {
    setStances((current) => ({ ...current, [field]: nextStance(current[field] ?? "neutral") }));
  }

  async function confirm(): Promise<void> {
    setWorking(true);
    await recordOnboardingStances(
      ONBOARDING_FIELDS.map((field) => ({
        topicLabel: field,
        stance: stances[field] ?? "neutral",
      })),
    );
    await useDiscoveryChannelSettingsStore.getState().dismissOnboarding();
    onDone();
    // The first fetches go looking for what was just said; the feed shows whatever lands. This
    // round asks for its own recall pass: the pool the app filled at launch is stocked, and a
    // stocked pool is exactly the case where an ordinary restock would poll and stop there.
    void useDiscoveryStore.getState().refillPoolForFirstRunAnswers();
  }

  async function skip(): Promise<void> {
    setWorking(true);
    await useDiscoveryChannelSettingsStore.getState().dismissOnboarding();
    onDone();
  }

  return (
    <div className="mx-auto max-w-2xl py-10">
      <h2 className="font-semibold text-stone-800 text-xl">你想看哪些方面？</h2>
      <p className="mt-3 text-[15px] text-stone-600 leading-relaxed">{INTRO}</p>
      <p className="mt-2 text-sm text-stone-400">{CYCLE_HINT}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        {ONBOARDING_FIELDS.map((field) => {
          const stance = stances[field] ?? "neutral";
          return (
            <button
              key={field}
              type="button"
              aria-label={`${field}：${stanceLabel(stance)}`}
              onClick={() => cycle(field)}
              className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${CHIP_STYLES[stance]}`}
            >
              {field}
              {stance !== "neutral" && (
                <span className="ml-1.5 text-xs no-underline">{stanceLabel(stance)}</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-8 flex items-center gap-3">
        <button
          type="button"
          disabled={working}
          onClick={() => void confirm()}
          className="rounded-xl bg-amber-500 px-5 py-2 text-white transition-colors hover:bg-amber-600 disabled:opacity-60"
        >
          完成
        </button>
        <button
          type="button"
          disabled={working}
          onClick={() => void skip()}
          className="rounded-xl px-4 py-2 text-sm text-stone-500 hover:bg-stone-100"
        >
          跳过
        </button>
      </div>
    </div>
  );
}
