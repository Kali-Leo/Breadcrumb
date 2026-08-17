/**
 * Purpose: the two discovery signals that are not about a card (spec 053 §6) — moving the feed's
 * 熟悉的多一点｜新领域多一点 switch, and the positions taken in the first-run panel. Both go into
 * discovery_events like every other signal, so one stream still holds everything the ordering
 * reads.
 * Side effects: writes discovery_events rows; reads the stream to see whether the first-run
 * panel was ever answered.
 * Main exports: recordFeedDialMove, recordOnboardingStances, onboardingStanceValue,
 * hasRecordedOnboardingStances.
 */
import { getRepos } from "./db";
import { recordDiscoveryEvent } from "./discoveryFeedPaging";
import type { OnboardingStance } from "./discoveryOnboarding";

/** card_id and topic_label are NOT NULL columns, and neither of these events belongs to a card:
 * an empty string is the "no card" marker. Nothing reads it — the dial's rows are filtered out
 * of the fold by kind (discoveryOrdering), and the first-run rows are read for their
 * topic_label, which they do carry. */
const NO_CARD = "";

/** The dial's rows are kept for the record (what the reader asked for, and when), not for the
 * fold: value_ms carries the exploration share in thousandths, the same number the ordering
 * takes from settings. */
export async function recordFeedDialMove(explorationShare: number): Promise<void> {
  await recordDiscoveryEvent(NO_CARD, NO_CARD, "dial", Math.round(explorationShare * 1000));
}

/**
 * What one first-run position is worth in the event stream. The interest model reads the SIGN of
 * value_ms for kind 'onboarding' (positive = 想看, negative = 不想看) and ignores the magnitude,
 * so the smallest honest numbers are written. 一般 says nothing and is not written at all — an
 * unwritten field is exactly the neutral prior the model already assumes.
 */
export function onboardingStanceValue(stance: OnboardingStance): number | null {
  if (stance === "want") return 1;
  if (stance === "avoid") return -1;
  return null;
}

export interface OnboardingFieldStance {
  topicLabel: string;
  stance: OnboardingStance;
}

/** Writes one row per field the reader took a position on. Order is preserved, one row at a
 * time, so a failure halfway leaves the rows already written intact. */
export async function recordOnboardingStances(
  stances: readonly OnboardingFieldStance[],
): Promise<void> {
  for (const { topicLabel, stance } of stances) {
    const value = onboardingStanceValue(stance);
    if (value === null) continue;
    await recordDiscoveryEvent(NO_CARD, topicLabel, "onboarding", value);
  }
}

/** Whether the first-run panel has already left its mark. Asked alongside the "was it dismissed"
 * setting, so a library that carries the positions but lost the setting is not asked twice. */
export async function hasRecordedOnboardingStances(): Promise<boolean> {
  const repos = await getRepos();
  const events = await repos.discovery.listAllEvents();
  return events.some((event) => event.kind === "onboarding");
}
