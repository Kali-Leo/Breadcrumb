/**
 * Purpose: the demo learner's one learning goal and the requires edges its decomposition
 * wrote — the piece that makes the palace's 休闲/目标 switch mean something on example data.
 * Without a goal the ranked mode has no gap to boost, so both modes produced the identical
 * list and the switch looked broken.
 *
 * The goal deliberately bites into concepts the learner already half-owns: they have been
 * reading astronomy for three months and keeping an observing log, and 数组高阶函数 is
 * already claimed as learned — so the goal's remaining work is the reduce/group-by branch of
 * the existing JavaScript tree, not some unrelated new island. That is what makes 目标 mode
 * visibly reorder the SAME landscape rather than show a different one.
 *
 * Shape mirrors what apps/desktop's persistCalibratedGoal actually writes for a real goal:
 * one goals row whose node_ids_json holds every mapped node (matched + suggested alike), plus
 * `requires` edges between those nodes only, origin "llm" at the same middling confidence the
 * goal-decomposition path records — so a later edge judge can still correct them.
 * Main exports: DEMO_GOAL_ID, DEMO_GOAL_CONCEPT_IDS, DEMO_GOAL_REQUIRES, buildGoalSeed.
 */
import type { GoalRow, KnowledgeEdgeRow } from "@breadcrumb/core-db";
import { demoId, isoAt } from "./shared";
import type { ConceptId, DemoText } from "./text/demoText";

export const DEMO_GOAL_ID = demoId("goal", "observing-log");

/** Every node the goal is mapped onto, in decomposition order (foundations first). Kept as
 * ids, like every other relationship in this package, so translating the goal's title can
 * never move the goal. */
export const DEMO_GOAL_CONCEPT_IDS: readonly ConceptId[] = [
  "array-higher-order",
  "array-filter",
  "predicate-functions",
  "composing-predicates",
  "array-reduce",
  "reduce-initial-value",
  "accumulator-pattern",
  "group-by",
  "object-accumulator",
  "map-or-object",
];

/** `[prerequisite, dependent]` — the edge convention is `source --requires--> target`, i.e.
 * the source must be learned first. Two branches (filter/predicate and reduce/accumulator)
 * that meet again at 分组统计, so the recommended route has a real choice to make at every
 * step instead of one forced chain. Acyclic by construction. */
export const DEMO_GOAL_REQUIRES: readonly (readonly [ConceptId, ConceptId])[] = [
  ["array-higher-order", "array-filter"],
  ["array-higher-order", "array-reduce"],
  ["array-filter", "predicate-functions"],
  ["predicate-functions", "composing-predicates"],
  ["array-reduce", "reduce-initial-value"],
  ["array-reduce", "accumulator-pattern"],
  ["reduce-initial-value", "accumulator-pattern"],
  ["accumulator-pattern", "group-by"],
  ["accumulator-pattern", "object-accumulator"],
  ["composing-predicates", "group-by"],
  ["group-by", "map-or-object"],
  ["object-accumulator", "map-or-object"],
];

/** Same middling confidence apps/desktop records for a goal-decomposition edge: high enough
 * to plan on, low enough that a dedicated edge judge can overwrite it later. */
const GOAL_EDGE_CONFIDENCE = 0.6;

/** The goal was set about two and a half weeks ago — after the self-report on 数组高阶函数
 * (20 days), so the one node already ticked off reads as progress made before the goal, which
 * is exactly how a real learner arrives at one. */
const GOAL_DAYS_AGO = 18;

export interface GoalSeedResult {
  /** null when none of the goal's concepts were inserted (every label already existed in the
   * user's own tree) — a goal over zero nodes is noise, not a demo. */
  goal: GoalRow | null;
  edges: KnowledgeEdgeRow[];
}

/** Builds the goal row and its requires edges over whichever of the goal's concepts
 * concepts.ts actually inserted. A concept whose label already existed in the user's tree is
 * skipped there, so both the node id list and every edge touching it are dropped here too —
 * the same rule claims.ts follows, and the reason this cannot violate the foreign key. */
export function buildGoalSeed(
  now: Date,
  nodeIdById: ReadonlyMap<ConceptId, string>,
  text: DemoText,
): GoalSeedResult {
  const nodeIds = DEMO_GOAL_CONCEPT_IDS.map((id) => nodeIdById.get(id)).filter(
    (id): id is string => id !== undefined,
  );
  if (nodeIds.length === 0) return { goal: null, edges: [] };

  const createdAt = isoAt(now, GOAL_DAYS_AGO, 21, 15);
  const edges: KnowledgeEdgeRow[] = [];
  DEMO_GOAL_REQUIRES.forEach(([prerequisite, dependent], index) => {
    const source_id = nodeIdById.get(prerequisite);
    const target_id = nodeIdById.get(dependent);
    if (source_id === undefined || target_id === undefined) return;
    edges.push({
      id: demoId("edge", index),
      source_id,
      target_id,
      edge_type: "requires",
      weight: 1,
      confidence: GOAL_EDGE_CONFIDENCE,
      origin: "llm",
      created_at: createdAt,
      reasoning: null,
      source_message_id: null,
    });
  });

  return {
    goal: {
      id: DEMO_GOAL_ID,
      title: text.goalTitle,
      node_ids_json: JSON.stringify(nodeIds),
      created_at: createdAt,
      updated_at: createdAt,
    },
    edges,
  };
}
