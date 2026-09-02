/**
 * Purpose: goal-mapping LLM call and goal persistence/self-statement helpers for plannerStore,
 * split out so the store itself stays under the file-size ceiling. No React/zustand here.
 * Main exports: requestGoalMapping, persistCalibratedGoal, claimNodeAsLearned, removeNodeFromGoal.
 */
import type { GoalRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildGoalMappingMessages,
  type GoalMappingResult,
  goalMappingSchema,
} from "@breadcrumb/plugin-planner";
import { appEventBus } from "../stores/chatStore";
import type { ApiConfig } from "../stores/settingsStore";
import type { Repos } from "./db";
import { embedNodes } from "./embeddings";
import { planGoalRequiresEdges } from "./goalRequiresEdges";
import { llmConfigFrom } from "./llmConfig";
import { recordMeteredCall } from "./metering";
import { goalNodeIds } from "./plannerGapActions";
import { newId, nowIso } from "./time";

/** Confidence recorded on a requires edge that came from goal decomposition rather than the
 * dedicated edge judge. Deliberately middling: asking an LLM for prerequisites inside a small
 * known label set is its high-precision case (reported precision 72-87%, recall 36-63%), but
 * it is still one unreviewed judgment, and the edges repo keeps whichever judgment has the
 * higher confidence — so a later dedicated edge-judge pass can correct this one, not the
 * other way round. */
const GOAL_REQUIRES_EDGE_CONFIDENCE = 0.6;

/** Calls the goal-mapping LLM and meters it under purpose "goal-planning". Throws on
 * failure — the caller (plannerStore) decides how to degrade. */
export async function requestGoalMapping(
  apiConfig: ApiConfig,
  goalText: string,
  existingNodeLabels: readonly string[],
): Promise<GoalMappingResult> {
  const config = llmConfigFrom(apiConfig);
  const { parsed, usage } = await chatJson(
    config,
    buildGoalMappingMessages(goalText, existingNodeLabels),
    goalMappingSchema,
  );
  await recordMeteredCall({
    purpose: "goal-planning",
    model: config.model,
    conversationId: null,
    usage,
  });
  return parsed;
}

/** Inserts every suggested node as a sighting-free concept node (no fake evidence — they
 * start unlit), writes the prerequisite edges the mapping declared between them, embeds them
 * right away, then saves the goal row over existing + newly-inserted node ids. Persists the
 * LLM mapping's full result — existing and suggested alike — immediately: there is no
 * checkbox calibration step (2026-08-02: a learner who hasn't studied the material can't
 * judge what belongs; domain judgment is the system's job, not a decision request placed on
 * the user).
 *
 * The edges and the embeddings both land in the same breath as the nodes on purpose: goal
 * nodes never reach the edge judge (it only fires on conversation-extracted nodes) and the
 * embedding backfill only runs at next startup, so a goal decomposed today used to have no
 * structure and no vectors until tomorrow — which is precisely when the learner looks at its
 * route (2026-08-28 audit, planning gap 1).
 *
 * Idempotent on title: if a goal with the identical trimmed title already exists, its
 * node_ids_json/updated_at are refreshed in place instead of inserting a duplicate card
 * (a re-mapped goal text should update the same goal, not clone it — this is also how a
 * skipped node comes back: re-run 拆解目标 with the same title). */
export async function persistCalibratedGoal(
  repos: {
    knowledgeNodes: Pick<Repos["knowledgeNodes"], "insert">;
    knowledgeEdges: Pick<Repos["knowledgeEdges"], "listAll" | "upsert">;
    goals: Pick<Repos["goals"], "listAll" | "insert" | "updateNodeIds">;
  },
  title: string,
  mapping: GoalMappingResult,
  currentNodes: readonly KnowledgeNodeRow[],
  /** Injected so tests can observe the call without reaching the Tauri embedding command;
   * production always uses the real one. */
  embed: (nodes: readonly KnowledgeNodeRow[]) => Promise<void> = embedNodes,
): Promise<{ goalId: string; insertedNodes: boolean }> {
  const labelToId = new Map(currentNodes.map((node) => [node.label, node.id]));
  const createdAt = nowIso();
  const trimmedTitle = title.trim();

  const suggestedIds: string[] = [];
  const suggestedRows: KnowledgeNodeRow[] = [];
  for (const suggestedNode of mapping.suggested) {
    const row: KnowledgeNodeRow = {
      id: newId(),
      parent_id: null,
      label: suggestedNode.label,
      summary: suggestedNode.summary,
      kind: "concept",
      created_at: createdAt,
    };
    await repos.knowledgeNodes.insert(row);
    suggestedIds.push(row.id);
    suggestedRows.push(row);
  }

  const existingIds = mapping.existing
    .map((label) => labelToId.get(label))
    .filter((id): id is string => id !== undefined);
  const nodeIds = [...existingIds, ...suggestedIds];

  await writeGoalRequiresEdges(repos, mapping, labelToId, suggestedRows);
  await embed(suggestedRows);

  const existingGoals = await repos.goals.listAll();
  const duplicateGoal = existingGoals.find((goal) => goal.title.trim() === trimmedTitle);
  if (duplicateGoal !== undefined) {
    await repos.goals.updateNodeIds(duplicateGoal.id, nodeIds, createdAt);
    return { goalId: duplicateGoal.id, insertedNodes: suggestedIds.length > 0 };
  }

  const goalId = newId();
  await repos.goals.insert({
    id: goalId,
    title: trimmedTitle,
    node_ids_json: JSON.stringify(nodeIds),
    created_at: createdAt,
    updated_at: createdAt,
  });

  return { goalId, insertedNodes: suggestedIds.length > 0 };
}

/** Writes the mapping's declared prerequisite edges, resolving labels ONLY against this
 * mapping's own existing + suggested set (the prompt's rule, enforced here rather than
 * trusted: a label naming some unrelated corner of the tree is a hallucination, not an edge).
 * Cycle-rejected edges are logged, matching how the edge-judge path reports them. */
async function writeGoalRequiresEdges(
  repos: { knowledgeEdges: Pick<Repos["knowledgeEdges"], "listAll" | "upsert"> },
  mapping: GoalMappingResult,
  existingLabelToId: ReadonlyMap<string, string>,
  suggestedRows: readonly KnowledgeNodeRow[],
): Promise<void> {
  const idByLabel = new Map<string, string>();
  for (const label of mapping.existing) {
    const id = existingLabelToId.get(label);
    if (id !== undefined) idByLabel.set(label, id);
  }
  for (const row of suggestedRows) idByLabel.set(row.label, row.id);

  const planned = planGoalRequiresEdges({
    suggested: mapping.suggested,
    idByLabel,
    existingEdges: await repos.knowledgeEdges.listAll(),
    confidence: GOAL_REQUIRES_EDGE_CONFIDENCE,
    newId,
    nowIso,
  });
  for (const rejected of planned.rejectedCyclic) {
    console.warn("goal decomposition: dropped a requires edge that would create a cycle", rejected);
  }
  for (const label of planned.unknownLabels) {
    console.warn("goal decomposition: dropped a requires label outside this mapping", label);
  }
  for (const edge of planned.edges) {
    await repos.knowledgeEdges.upsert(edge);
  }
}

/** "我已经会了" — a direct self-statement mastery claim for one gap node. No LLM call: the
 * learner already knows which node this is, so there is nothing to map. Emits
 * mastery:updated so every subscriber (plannerStore's own recompute included) picks it up;
 * the node leaves the gap the same way any other lit node would. */
export async function claimNodeAsLearned(
  repos: { masteryClaims: Pick<Repos["masteryClaims"], "insert"> },
  nodeId: string,
): Promise<void> {
  await repos.masteryClaims.insert({
    id: newId(),
    node_id: nodeId,
    level: "learned",
    source: "self-report",
    created_at: nowIso(),
  });
  appEventBus.emit("mastery:updated", { changedNodeIds: [nodeId] });
}

/** "先跳过" — removes one node id from a goal's own node_ids_json. No separate undo
 * mechanism: re-running 拆解目标 on the identical title restores the full mapped set via
 * persistCalibratedGoal's idempotent update. A no-op if the node wasn't an explicit member of
 * this goal's set (e.g. it's only present because another still-included node requires it as
 * a prerequisite — correctly so, since that prerequisite is still genuinely necessary). */
export async function removeNodeFromGoal(
  repos: { goals: Pick<Repos["goals"], "updateNodeIds"> },
  goal: GoalRow,
  nodeId: string,
): Promise<void> {
  const remainingNodeIds = goalNodeIds(goal).filter((id) => id !== nodeId);
  await repos.goals.updateNodeIds(goal.id, remainingNodeIds, nowIso());
}
