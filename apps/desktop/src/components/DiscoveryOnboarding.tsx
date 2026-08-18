/**
 * Purpose: the one screen the discovery feed opens with the first time (spec 053 §6) — the fields
 * to take a position on, grouped, with each chip wearing its own position so the three states are
 * read off the control instead of explained in a paragraph. Positions are a starting point, not a
 * filter: they seed the first fetches and are outweighed by real reading within a week (see
 * interestModel).
 * Main exports: DiscoveryOnboarding.
 */
import { useState } from "react";
import { recordOnboardingStances } from "../lib/discoveryFeedbackEvents";
import {
  nextStance,
  ONBOARDING_FIELD_GROUPS,
  ONBOARDING_FIELDS,
  type OnboardingStance,
  stanceLabel,
} from "../lib/discoveryOnboarding";
import { useDiscoveryChannelSettingsStore } from "../stores/discoveryChannelSettingsStore";
import { useDiscoveryStore } from "../stores/discoveryStore";

export const ONBOARDING_HEADING = "选择你感兴趣的领域";
export const ONBOARDING_INTRO = "发现页会按这些给你推荐文章、视频和播客，不用选全。";

const CHIP_STYLES: Readonly<Record<OnboardingStance, string>> = {
  neutral: "border-stone-300 bg-white text-stone-600 hover:bg-stone-50",
  want: "border-amber-500 bg-amber-500 text-white",
  avoid: "border-stone-200 bg-stone-100 text-stone-400",
};

/** The position is spelled out on every chip, 一般 included: the reader sees all three words
 * happen as they tap, so nothing has to say "tap again for the next one". */
const STANCE_STYLES: Readonly<Record<OnboardingStance, string>> = {
  neutral: "text-stone-400",
  want: "text-white",
  avoid: "text-stone-400",
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
    void useDiscoveryStore.getState().refillPool({ forceRecall: true });
  }

  async function skip(): Promise<void> {
    setWorking(true);
    await useDiscoveryChannelSettingsStore.getState().dismissOnboarding();
    onDone();
  }

  // One window tall, whatever the window is: the fields scroll inside, 完成 and 跳过 stay on
  // screen. The negative top margin takes back the page's own top padding, which is added again
  // inside — without it the panel would stand one padding taller than the window and push its own
  // buttons under the fold on a short one.
  return (
    <div className="-mt-6 mx-auto flex h-full max-w-3xl flex-col">
      <div className="pt-6 pb-4">
        <h2 className="font-semibold text-stone-800 text-xl">{ONBOARDING_HEADING}</h2>
        <p className="mt-2 text-[15px] text-stone-600">{ONBOARDING_INTRO}</p>
      </div>
      {/* The groups scroll on a short window; 完成 and 跳过 stay put below them. */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {ONBOARDING_FIELD_GROUPS.map((group) => (
          <section key={group.name}>
            <h3 className="mb-2 text-sm text-stone-400">{group.name}</h3>
            <div className="flex flex-wrap gap-2">
              {group.fields.map((field) => {
                const stance = stances[field] ?? "neutral";
                return (
                  <button
                    key={field}
                    type="button"
                    aria-label={`${field}：${stanceLabel(stance)}`}
                    onClick={() => cycle(field)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${CHIP_STYLES[stance]}`}
                  >
                    <span className={stance === "avoid" ? "line-through" : undefined}>{field}</span>
                    <span className={`ml-1.5 text-xs ${STANCE_STYLES[stance]}`}>
                      {stanceLabel(stance)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <div className="flex items-center gap-3 border-stone-200 border-t py-4">
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
