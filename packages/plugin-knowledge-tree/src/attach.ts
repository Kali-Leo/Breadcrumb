/**
 * Purpose: pure tree logic — resolves extracted nodes' parent labels against the existing
 * tree (and each other), dedupes by label, and produces insert-ready rows.
 * Main exports: planNodeInserts.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import type { ExtractedNode } from "./extraction";

export interface NodeInsertPlanInput {
  conversationId: string;
  sourceMessageId: string | null;
  existingNodes: readonly KnowledgeNodeRow[];
  extracted: readonly ExtractedNode[];
  newId(): string;
  nowIso(): string;
}

/** Returns rows ready for insertion; nodes whose label already exists are skipped. */
export function planNodeInserts(input: NodeInsertPlanInput): KnowledgeNodeRow[] {
  const idByLabel = new Map(input.existingNodes.map((node) => [node.label, node.id]));
  const planned: KnowledgeNodeRow[] = [];

  for (const node of input.extracted) {
    if (idByLabel.has(node.label)) continue; // already in the tree — never duplicate
    const row: KnowledgeNodeRow = {
      id: input.newId(),
      conversation_id: input.conversationId,
      parent_id: node.parentLabel === null ? null : (idByLabel.get(node.parentLabel) ?? null),
      label: node.label,
      summary: node.summary,
      source_message_id: input.sourceMessageId,
      created_at: input.nowIso(),
    };
    idByLabel.set(row.label, row.id);
    planned.push(row);
  }
  return planned;
}
