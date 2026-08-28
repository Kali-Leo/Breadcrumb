/**
 * Purpose: turns a goal mapping's `suggested[].requires` labels into requires edge rows —
 * the first-write path that gives a freshly decomposed goal any structure at all. Without it
 * a new goal's gap has zero requires edges, so every candidate ties on every scoring term and
 * the "recommended route" collapses into alphabetical order (2026-08-28 audit, planning gap 1).
 * Pure planning only: no DB, no I/O — the caller upserts what comes back.
 * Main exports: planGoalRequiresEdges, PlannedGoalEdges.
 */
import type { KnowledgeEdgeRow } from "@breadcrumb/core-db";
import { wouldCreateCycle } from "@breadcrumb/plugin-graph";
import type { SuggestedGoalNode } from "@breadcrumb/plugin-planner";

export interface PlannedGoalEdges {
  edges: KnowledgeEdgeRow[];
  /** Edges the cycle guard refused, first-come-first-served against edges already in the
   * store — reported so the caller can log them rather than lose them silently. */
  rejectedCyclic: { source_id: string; target_id: string }[];
  /** requires labels naming something outside this mapping's own existing+suggested set. The
   * prompt forbids them; the model does it anyway sometimes, and inventing a node for a bare
   * label would be exactly the "AI 空想" the goal pipeline is not allowed to do. */
  unknownLabels: string[];
}

export function planGoalRequiresEdges(input: {
  suggested: readonly SuggestedGoalNode[];
  /** Label -> node id for every node in THIS mapping (matched existing + freshly inserted
   * suggested). A requires label outside this map is dropped. */
  idByLabel: ReadonlyMap<string, string>;
  existingEdges: readonly KnowledgeEdgeRow[];
  confidence: number;
  newId: () => string;
  nowIso: () => string;
}): PlannedGoalEdges {
  const edges: KnowledgeEdgeRow[] = [];
  const rejectedCyclic: { source_id: string; target_id: string }[] = [];
  const unknownLabels: string[] = [];
  let workingEdges: KnowledgeEdgeRow[] = [...input.existingEdges];

  for (const suggestedNode of input.suggested) {
    const target_id = input.idByLabel.get(suggestedNode.label);
    if (target_id === undefined) continue;
    for (const requiredLabel of suggestedNode.requires ?? []) {
      const source_id = input.idByLabel.get(requiredLabel);
      if (source_id === undefined) {
        unknownLabels.push(requiredLabel);
        continue;
      }
      // A self-requirement is also what wouldCreateCycle calls a cycle; let it decide.
      if (wouldCreateCycle(workingEdges, { source_id, target_id })) {
        rejectedCyclic.push({ source_id, target_id });
        continue;
      }
      const edge: KnowledgeEdgeRow = {
        id: input.newId(),
        source_id,
        target_id,
        edge_type: "requires",
        weight: 1,
        confidence: input.confidence,
        origin: "llm",
        created_at: input.nowIso(),
      };
      edges.push(edge);
      workingEdges = [...workingEdges, edge];
    }
  }

  return { edges, rejectedCyclic, unknownLabels };
}
