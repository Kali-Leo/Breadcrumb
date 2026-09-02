/**
 * Purpose: the experimental search-build pipeline (spec 023 §5) — one metered LLM proposal
 * with mandatory per-item citations, a URL verification pass over every unique cited source
 * (unreachable or off-topic pages kill their whole branch, see compareCitationVerify.ts), and
 * a whole-build failure when too little survives (宁缺毋假). Returns the display facts the UI
 * must show: token usage and cost. Main exports: runExperimentalProfileBuild,
 * runProposalPipeline, ExperimentalBuildOutcome, VerifiedProposal.
 */
import {
  calculateCostMicros,
  chatJson,
  formatCost,
  resolveModelRates,
  type TokenUsage,
} from "@breadcrumb/core-llm";
import {
  buildCompareProposalMessages,
  type SearchedProposalItem,
  searchedProfileProposalSchema,
  survivesThreshold,
} from "@breadcrumb/feature-compare";
import i18next from "i18next";
import type { ApiConfig } from "../../stores/settingsStore";
import { recordMeteredCall } from "../billing/metering";
import { getRepos } from "../platform/db";
import { recordAiFailure } from "../platform/failureLog";
import { currentPriceCurrency, currentPriceOverride, llmConfigFrom } from "../platform/llmConfig";
import { newId, nowIso } from "../platform/time";
import { verifyCitedSources } from "./compareCitationVerify";

export type ExperimentalBuildOutcome =
  | { ok: true; profileId: string; costLine: string; droppedCount: number }
  | { ok: false; reason: string; costLine: string | null };

function costLineOf(model: string, usage: TokenUsage): string {
  const price = resolveModelRates(model, {
    currency: currentPriceCurrency(),
    override: currentPriceOverride(),
  });
  const cost = price
    ? formatCost(calculateCostMicros(usage, price), price.currency)
    : i18next.t("palace:compare.buildCostUnknown");
  return i18next.t("palace:compare.buildCost", { cost });
}

export type VerifiedProposal =
  | {
      ok: true;
      surviving: readonly SearchedProposalItem[];
      title: string;
      description: string;
      costLine: string;
      droppedCount: number;
    }
  | { ok: false; reason: string; costLine: string | null };

/**
 * Shared proposal pipeline (spec 023 §5 / spec 028 hub decomposition): one metered LLM
 * proposal with mandatory citations, per-URL verification, whole-run failure when too
 * little survives. Callers decide where the surviving items land.
 */
export async function runProposalPipeline(
  apiConfig: ApiConfig,
  input: { topic: string; mainland: boolean },
): Promise<VerifiedProposal> {
  const config = llmConfigFrom(apiConfig);
  let usage: TokenUsage;
  let items: readonly SearchedProposalItem[];
  let title: string;
  let description: string;
  try {
    const result = await chatJson(
      config,
      buildCompareProposalMessages(input),
      searchedProfileProposalSchema,
    );
    usage = result.usage;
    items = result.parsed.items;
    title = result.parsed.title;
    description = result.parsed.description;
    await recordMeteredCall({
      purpose: "compare-profile",
      model: config.model,
      conversationId: null,
      usage,
    });
  } catch (error) {
    void recordAiFailure("compare-profile", error);
    return {
      ok: false,
      reason: i18next.t("palace:compare.buildDraftFailed"),
      costLine: null,
    };
  }

  const { surviving, verdicts } = await verifyCitedSources(items);
  const costLine = costLineOf(config.model, usage);
  if (!survivesThreshold(items.length, surviving.length)) {
    const failedSamples = verdicts
      .filter((verdict) => !verdict.ok)
      .slice(0, 3)
      .map((verdict) => verdict.url)
      .join(" | ");
    void recordAiFailure(
      "compare-profile",
      new Error(
        `build discarded: ${surviving.length}/${items.length} items verified; failed sources: ${failedSamples}`,
      ),
    );
    return {
      ok: false,
      reason: i18next.t("palace:compare.buildSourcesFailed"),
      costLine,
    };
  }
  return {
    ok: true,
    surviving,
    title,
    description,
    costLine,
    droppedCount: items.length - surviving.length,
  };
}

/**
 * The standalone experimental build. The caller has already checked the feature switch,
 * network switch, and API config; this function does the work and reports plainly.
 */
export async function runExperimentalProfileBuild(
  apiConfig: ApiConfig,
  input: { topic: string; mainland: boolean },
): Promise<ExperimentalBuildOutcome> {
  const proposal = await runProposalPipeline(apiConfig, input);
  if (!proposal.ok) return proposal;
  const { surviving, title, description, costLine, droppedCount } = proposal;
  const profileId = `searched-${newId()}`;
  const repos = await getRepos();
  await repos.comparisons.replaceProfile(
    {
      id: profileId,
      title,
      origin: "searched",
      description,
      source_note: `实验功能：检索构建于 ${nowIso().slice(0, 10)}，每条来源都验证过：网址能打开、内容对得上`,
      created_at: nowIso(),
      // The search-build pipeline only ever proposes curriculum/skill-tree topics (spec 026's
      // occupation category has its own separate build pipeline).
      category: "curriculum",
    },
    surviving.map((item, index) => ({
      id: `${profileId}:${item.key}`,
      profile_id: profileId,
      parent_id: item.parentKey === null ? null : `${profileId}:${item.parentKey}`,
      label: item.label,
      aliases_json: JSON.stringify(item.aliases),
      source_ref: `${item.sourceTitle} · ${item.sourceUrl}`,
      position: index,
      concept_id: null,
      item_kind: "knowledge",
    })),
  );
  return { ok: true, profileId, costLine, droppedCount };
}
