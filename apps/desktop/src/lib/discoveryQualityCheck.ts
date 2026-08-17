/**
 * Purpose: the discovery feed's batch quality check (spec 053 §5) — one flash-level call per
 * fetched batch that rates how much substance each item's title + summary promises. The whole
 * feature is advisory: the score only demotes an item in ranking and never hides it, so every
 * failure path here returns an empty map, which downstream reads as "this batch is unrated"
 * and orders it exactly as it would have without the call.
 * Side effects: one LLM call, one metering row (purpose "discovery-quality-check"), an
 * ai_failures row on error.
 * Main exports: scoreBatchQuality.
 */
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildQualityCheckMessages,
  QUALITY_CHECK_BATCH_CAP,
  type QualityCheckItem,
  qualityCheckResponseSchema,
} from "@breadcrumb/plugin-discovery";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { useSettingsStore } from "../stores/settingsStore";
import { recordAiFailure } from "./failureLog";
import { recordMeteredCall } from "./metering";

/** Rates one fetched batch, returning id → substance (0..1) for the items the model actually
 * rated. Returns an empty map — with no LLM call at all — when the batch is empty, the
 * 发现 · 质检 switch is off, networking is off, or there is no API config; returns an empty
 * map and logs to ai_failures on any error. Items past QUALITY_CHECK_BATCH_CAP are left
 * unrated rather than triggering a second call: one batch costs exactly one call.
 *
 * conversationId is null for the ordinary background fetch (no conversation is involved); it
 * exists so a future in-conversation trigger can attribute its spend the way every other
 * metered call site does.
 */
export async function scoreBatchQuality(
  items: readonly QualityCheckItem[],
  conversationId: string | null,
): Promise<Map<string, number>> {
  const empty = new Map<string, number>();
  if (items.length === 0) return empty;

  const { featureSwitches, networkEnabled, apiConfig } = useSettingsStore.getState();
  if (!featureSwitches.discoveryQualityCheck || !networkEnabled || apiConfig === null) {
    return empty;
  }

  const batch = items.slice(0, QUALITY_CHECK_BATCH_CAP);
  const knownIds = new Set(batch.map((entry) => entry.id));

  try {
    const config = { ...apiConfig, fetchImpl: tauriFetch };
    const { parsed, usage } = await chatJson(
      config,
      buildQualityCheckMessages(batch),
      qualityCheckResponseSchema,
    );
    await recordMeteredCall({
      purpose: "discovery-quality-check",
      model: config.model,
      conversationId,
      usage,
      responseHadContent: parsed.scores.length > 0,
    });

    const scores = new Map<string, number>();
    for (const score of parsed.scores) {
      // A hallucinated id belongs to nothing on screen; silently ignoring it keeps the map
      // exactly as trustworthy as the batch that went in.
      if (knownIds.has(score.id)) scores.set(score.id, score.substance);
    }
    return scores;
  } catch (error) {
    void recordAiFailure("discovery-quality-check", error);
    return empty;
  }
}
