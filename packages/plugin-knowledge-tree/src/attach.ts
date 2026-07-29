/**
 * Purpose: pure tree logic — plans changes to the USER's global tree from one round's
 * extraction: brand-new concepts become nodes, already-known concepts become re-sightings.
 * Every touched concept leaves a sighting (footprint) for the conversation.
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
    });
  }

  for (const extracted of input.extracted) {
    const existingId = idByLabel.get(extracted.label);
    if (existingId !== undefined) {
      addSighting(existingId); // re-met a known concept — a review signal, not a new node
      continue;
    }
    const node: KnowledgeNodeRow = {
      id: input.newId(),
      parent_id:
        extracted.parentLabel === null ? null : (idByLabel.get(extracted.parentLabel) ?? null),
      label: extracted.label,
      summary: extracted.summary,
      created_at: input.nowIso(),
    };
    idByLabel.set(node.label, node.id);
    newNodes.push(node);
    addSighting(node.id);
  }
  return { newNodes, sightings };
}
