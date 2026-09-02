/**
 * Purpose: the self-report journey action — maps a persona's knownTopics onto the existing
 * tree via LLM, and (S4) keeps whatever doesn't match yet in a per-journey pending queue
 * instead of dropping it, retried here and once more at day end (journey.ts).
 * Main exports: applySelfReport, resolvePendingSelfReportTopics.
 */
import { randomUUID } from "node:crypto";
import { chatJson } from "@breadcrumb/core-llm";
import { buildSelfReportMessages, selfReportMappingSchema } from "@breadcrumb/plugin-interest";
import type { SimlabRepos } from "../db/repos";
import type { JourneyActionContext } from "./journeyActionTypes";
import type { TopicHint } from "./student";

/** Retries every pending self-reported topic against the tree's current labels — a topic
 * queued because its concept hadn't been created yet may match now that a later conversation
 * extracted it. Called both at the top of applySelfReport (so a subsequent self-report action
 * naturally retries) and once at day end (so a persona that never self-reports again still
 * gets a same-day chance once its topics enter the tree). Resolved topics are removed from
 * `pending` and reported via `onResolved` for the journey log. */
export async function resolvePendingSelfReportTopics(
  pending: Set<string>,
  repos: SimlabRepos,
  nowIso: string,
  onResolved: (label: string) => void,
): Promise<void> {
  if (pending.size === 0) return;
  const allNodes = await repos.knowledgeNodes.listAll();
  const nodeIdByLabel = new Map(allNodes.map((node) => [node.label, node.id]));
  for (const topic of pending) {
    const nodeId = nodeIdByLabel.get(topic);
    if (nodeId === undefined) continue;
    await repos.masteryClaims.insert({
      id: randomUUID(),
      node_id: nodeId,
      level: "learned",
      source: "self-report",
      created_at: nowIso,
    });
    pending.delete(topic);
    onResolved(topic);
  }
}

export async function applySelfReport(context: JourneyActionContext): Promise<TopicHint> {
  const { repos, persona, llmConfig } = context;
  if (persona.knowledge.knownTopics.length === 0) return { label: null, isDomainJump: false };

  // Retry anything queued from an earlier self-report first — the node backing it may have
  // been created by a conversation since then (S4 requeue).
  await resolvePendingSelfReportTopics(
    context.pendingSelfReportTopics,
    repos,
    context.nowIso,
    (label) => context.logStage({ event: "self-report-pending-resolved", label }),
  );

  const allNodes = await repos.knowledgeNodes.listAll();
  if (allNodes.length === 0) {
    // Nothing in the tree yet to plausibly match against — the whole brief is premature.
    for (const topic of persona.knowledge.knownTopics) context.pendingSelfReportTopics.add(topic);
    return { label: null, isDomainJump: false };
  }

  const userText = `我以前学过：${persona.knowledge.knownTopics.join("、")}`;
  const existingLabels = allNodes.map((node) => node.label);
  try {
    const { parsed, usage } = await chatJson(
      llmConfig,
      buildSelfReportMessages(userText, existingLabels),
      selfReportMappingSchema,
    );
    context.recordCall("self-report-mapping", llmConfig.model, usage);
    context.logStage({ purpose: "self-report-mapping", request: userText, response: parsed });

    const nodeIdByLabel = new Map(allNodes.map((node) => [node.label, node.id]));
    for (const mapping of parsed.mappings) {
      const nodeId = nodeIdByLabel.get(mapping.label);
      if (nodeId === undefined) continue;
      await repos.masteryClaims.insert({
        id: randomUUID(),
        node_id: nodeId,
        level: mapping.claimLevel,
        source: "self-report",
        created_at: context.nowIso,
      });
    }

    // The persona's own knownTopics that don't (yet) correspond to any existing tree node
    // can never have been in the LLM's candidate list — not a model miss, just premature
    // timing. Queue them instead of losing the signal for good.
    for (const topic of persona.knowledge.knownTopics) {
      if (!nodeIdByLabel.has(topic)) context.pendingSelfReportTopics.add(topic);
    }
  } catch (error) {
    context.recordFailure?.("self-report-mapping");
    context.logStage({
      purpose: "self-report-mapping",
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return { label: null, isDomainJump: false };
}
