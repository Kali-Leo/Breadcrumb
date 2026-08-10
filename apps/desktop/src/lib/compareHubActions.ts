/**
 * Purpose: on-demand hub decomposition (spec 028 §3) — runs the verified proposal pipeline
 * for one hub's topic and appends the surviving cited items UNDER that hub inside the same
 * profile, so the hub graduates from 待细分 to an aggregating sub-tree.
 * Main exports: runHubDecomposition.
 */
import type { ApiConfig } from "../stores/settingsStore";
import { type ExperimentalBuildOutcome, runProposalPipeline } from "./compareBuildActions";
import { getRepos } from "./db";

export async function runHubDecomposition(
  apiConfig: ApiConfig,
  input: { profileId: string; hubItemId: string; topic: string; mainland: boolean },
): Promise<ExperimentalBuildOutcome> {
  const proposal = await runProposalPipeline(apiConfig, {
    topic: input.topic,
    mainland: input.mainland,
  });
  if (!proposal.ok) return proposal;

  const repos = await getRepos();
  const profile = await repos.comparisons.getProfile(input.profileId);
  const existing = await repos.comparisons.listItems(input.profileId);
  const hubRow = existing.find((row) => row.id === input.hubItemId);
  if (profile === null || hubRow === undefined) {
    return {
      ok: false,
      reason: "这个节点在画像里找不到了，刷新后再试",
      costLine: proposal.costLine,
    };
  }
  const appended = proposal.surviving.map((item, index) => ({
    id: `${input.hubItemId}~${item.key}`,
    profile_id: input.profileId,
    parent_id: item.parentKey === null ? input.hubItemId : `${input.hubItemId}~${item.parentKey}`,
    label: item.label,
    aliases_json: JSON.stringify(item.aliases),
    source_ref: `${item.sourceTitle} · ${item.sourceUrl}`,
    position: existing.length + index,
    concept_id: null,
    item_kind: "knowledge",
  }));
  // Idempotence over repeats: a second run for the same hub replaces its old sub-items.
  const kept = existing.filter((row) => !row.id.startsWith(`${input.hubItemId}~`));
  await repos.comparisons.replaceProfile(profile, [...kept, ...appended]);
  return {
    ok: true,
    profileId: input.profileId,
    costLine: proposal.costLine,
    droppedCount: proposal.droppedCount,
  };
}
