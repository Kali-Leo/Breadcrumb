/**
 * Purpose: the daily trail summary's one job — on launch, if yesterday left footprints and
 * has no sentence yet, ask the model for one plain sentence about what was learned and keep
 * it in trail_summaries. At most one call per launch, only ever for yesterday, never a
 * back-fill of older days: a day the learner did not open the app is simply a day without
 * a sentence, not a debt. Failures degrade silently. Side effect on import: subscribes to
 * app:launched.
 * Main exports: generateYesterdayTrailSummary.
 */
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildTrailSummaryMessages,
  localDateString,
  localDayRange,
  trailSummarySchema,
} from "@breadcrumb/feature-trail";
import { appEventBus } from "../../stores/chatStore";
import { useFeedbackStore } from "../../stores/feedbackStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { recordFailedCallUsage, recordMeteredCall } from "../billing/metering";
import { getRepos } from "../platform/db";
import { degradeSilently } from "../platform/failureLog";
import { llmConfigFrom } from "../platform/llmConfig";
import { nowIso } from "../platform/time";

const PURPOSE = "trail-summary";

/** Single-flight: React's development double-mount fires app:launched twice back to back,
 * and both runs would pass the "no row yet" check before either had written one. */
let inFlight: Promise<void> | null = null;

/** Writes yesterday's sentence if yesterday had footprints and no sentence yet. Resolves
 * without doing anything when the switch or the network is off, when nothing was learned,
 * or when the row already exists. */
export function generateYesterdayTrailSummary(now: Date = new Date()): Promise<void> {
  inFlight ??= generateOnce(now).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function generateOnce(now: Date): Promise<void> {
  const settings = useSettingsStore.getState();
  if (!settings.featureSwitches.trailSummary || !settings.networkEnabled || !settings.apiConfig) {
    return;
  }
  const apiConfig = settings.apiConfig;
  try {
    const repos = await getRepos();
    const { fromIso, toIso } = localDayRange(now, -1);
    const date = localDateString(new Date(fromIso));
    if ((await repos.trailSummaries.get(date)) !== null) return;
    const nodes = await repos.knowledgeNodes.listSightedBetween(fromIso, toIso);
    if (nodes.length === 0) return;

    const config = llmConfigFrom(apiConfig);
    const { parsed, usage } = await chatJson(
      config,
      buildTrailSummaryMessages(nodes),
      trailSummarySchema,
    );
    await recordMeteredCall({ purpose: PURPOSE, model: config.model, conversationId: null, usage });
    await repos.trailSummaries.set({ date, content: parsed.summary, created_at: nowIso() });
    // The card may already be on screen (the map opened before this finished) — refresh it.
    await useFeedbackStore.getState().loadTrailSummaries();
  } catch (error) {
    void degradeSilently(PURPOSE, error);
    void recordFailedCallUsage(error, {
      purpose: PURPOSE,
      model: apiConfig.model,
      conversationId: null,
    });
  }
}

appEventBus.on("app:launched", ({ launchedAt }) => {
  void generateYesterdayTrailSummary(new Date(launchedAt));
});
