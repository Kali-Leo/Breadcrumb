/**
 * Purpose: pure tree logic — plans changes to the USER's global tree from one round's
 * extraction: brand-new concepts become nodes, already-known concepts become re-sightings.
 * Every touched concept leaves a sighting (footprint) for the conversation. An extracted
 * label that hits the alias table (spec 015 node-dedup gate) behaves exactly like a label
 * match on the canonical node — a sighting, never a duplicate.
 * Main exports: planNodeChanges, NodeChangePlan.
 */
import type { KnowledgeNodeRow, NodeSightingRow } from "@breadcrumb/core-db";
import type { ExtractedNode } from "./extraction";

export interface NodeChangePlanInput {
  conversationId: string;
  sourceMessageId: string | null;
  /** The user's whole tree (global — the tree belongs to the user, not the conversation). */
  existingNodes: readonly KnowledgeNodeRow[];
  extracted: readonly ExtractedNode[];
  /** Alias labels the synonym gate previously judged identical to an existing node (spec
   * 015) — a label found here resolves to its canonical node id exactly like a direct
   * label match, before any new-node logic runs. */
  aliasNodeIdByLabel: ReadonlyMap<string, string>;
  newId(): string;
  nowIso(): string;
}

export interface NodeChangePlan {
  /** Brand-new concepts to insert into the global tree. */
  newNodes: KnowledgeNodeRow[];
  /** One footprint per touched concept (new or re-met) for this conversation. */
  sightings: NodeSightingRow[];
}

export function planNodeChanges(input: NodeChangePlanInput): NodeChangePlan {
  const idByLabel = new Map(input.existingNodes.map((node) => [node.label, node.id]));
  const newNodes: KnowledgeNodeRow[] = [];
  const sightings: NodeSightingRow[] = [];
  const sightedNodeIds = new Set<string>();

  function addSighting(nodeId: string) {
    if (sightedNodeIds.has(nodeId)) return; // one footprint per concept per round
    sightedNodeIds.add(nodeId);
    sightings.push({
      id: input.newId(),
      node_id: nodeId,
      conversation_id: input.conversationId,
      message_id: input.sourceMessageId,
      created_at: input.nowIso(),
      // Filled in by the caller (knowledgeStore.ts) with the round's anchored node — this
      // pure planner has no notion of anchoring (spec 040 §7).
      origin_node_id: null,
    });
  }

  for (const extracted of input.extracted) {
    const existingId =
      idByLabel.get(extracted.label) ?? input.aliasNodeIdByLabel.get(extracted.label);
    if (existingId !== undefined) {
      addSighting(existingId); // re-met a known concept (or its alias) — a review signal, not a new node
      continue;
    }
    const node: KnowledgeNodeRow = {
      id: input.newId(),
      parent_id:
        extracted.parentLabel === null ? null : (idByLabel.get(extracted.parentLabel) ?? null),
      label: extracted.label,
      summary: extracted.summary,
      // This pipeline extracts curriculum concepts only; method nodes are proposed by
      // the knowledge-edge judge (feature-graph) instead.
      kind: "concept",
      created_at: input.nowIso(),
    };
    idByLabel.set(node.label, node.id);
    newNodes.push(node);
    addSighting(node.id);
  }
  return { newNodes, sightings };
}
