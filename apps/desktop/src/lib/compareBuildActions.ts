/**
 * Purpose: the experimental search-build pipeline (spec 023 §5) — one metered LLM proposal
 * with mandatory per-item citations, a URL verification pass over every unique cited source
 * (unreachable or off-topic pages kill their whole branch), and a whole-build failure when
 * too little survives (宁缺毋假). Returns the display facts the UI must show: token usage
 * and cost. Main exports: runExperimentalProfileBuild, runProposalPipeline,
 * ExperimentalBuildOutcome, VerifiedProposal.
 */
import {
  BUILTIN_MODEL_PRICES,
  calculateCostMicros,
  chatJson,
  formatCost,
  type TokenUsage,
} from "@breadcrumb/core-llm";
import {
  buildCompareProposalMessages,
  findRescueUrl,
  pruneUnverifiedBranches,
  type SearchedProposalItem,
  searchedProfileProposalSchema,
  survivesThreshold,
  verifyEvidenceText,
} from "@breadcrumb/plugin-compare";
import { createBingProvider } from "@breadcrumb/plugin-factcheck";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import i18next from "i18next";
import type { ApiConfig } from "../stores/settingsStore";
import { getRepos } from "./db";
import { recordAiFailure } from "./failureLog";
import { llmConfigFrom } from "./llmConfig";
import { recordMeteredCall } from "./metering";
import { newId, nowIso } from "./time";

export type ExperimentalBuildOutcome =
  | { ok: true; profileId: string; costLine: string; droppedCount: number }
  | { ok: false; reason: string; costLine: string | null };

function costLineOf(model: string, usage: TokenUsage): string {
  const price = BUILTIN_MODEL_PRICES[model];
  const cost = price
    ? formatCost(calculateCostMicros(usage, price), price.currency)
    : i18next.t("palace:compare.buildCostUnknown");
  return i18next.t("palace:compare.buildCost", { cost });
}

/** Fetches one cited URL and checks the page mentions the cited material's title tokens.
 * Any network error counts as unverified — the branch dies, the build never throws here. */
async function verifyUrl(url: string, sourceTitles: readonly string[]): Promise<boolean> {
  try {
    const response = await tauriFetch(url, { method: "GET" });
    if (!response.ok) return false;
    const text = await response.text();
    return sourceTitles.some((title) => verifyEvidenceText(text, title));
  } catch {
    return false;
  }
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

  // Verify each unique cited URL once; an item may share a source with its siblings.
  // Dead direct links get one search rescue: the model cites deep links from memory and
  // those rot (all three 2026-08-10 failures were a single hallucinated/rotted URL taking
  // the whole build to 0/N). A search hit proving the cited material exists revives the
  // branch and swaps in the reachable URL; no hit still kills it (宁缺毋假).
  const titlesByUrl = new Map<string, string[]>();
  for (const item of items) {
    const titles = titlesByUrl.get(item.sourceUrl) ?? [];
    titles.push(item.sourceTitle);
    titlesByUrl.set(item.sourceUrl, titles);
  }
  const bing = createBingProvider({ fetchImpl: tauriFetch });
  const verdicts = await Promise.all(
    [...titlesByUrl.entries()].map(async ([url, titles]) => {
      if (await verifyUrl(url, titles)) return { url, ok: true, rescueUrl: null };
      const results = await bing.search(titles[0] ?? "", 3);
      const rescueUrl = findRescueUrl(results, titles);
      return { url, ok: rescueUrl !== null, rescueUrl };
    }),
  );
  const verifiedUrls = new Set(verdicts.filter((verdict) => verdict.ok).map((v) => v.url));
  const rescuedUrlByOriginal = new Map(
    verdicts
      .filter((verdict) => verdict.rescueUrl !== null)
      .map((verdict) => [verdict.url, verdict.rescueUrl as string]),
  );

  const surviving = pruneUnverifiedBranches(items, verifiedUrls).map((item) => ({
    ...item,
    // The rescued URL is the one we actually verified as reachable — cite that.
    sourceUrl: rescuedUrlByOriginal.get(item.sourceUrl) ?? item.sourceUrl,
  }));
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
