/**
 * Purpose: hub-generic-node exclusion (spec 043 §7) — once term-marking becomes the primary
 * door source, the old label-matching source is demoted to a secondary supplier of standalone
 * doors, but it must never surface a hub/utility node (e.g. "函数") on its own: those are noise,
 * not vocabulary the learner is missing. A node is a hub if its label is short and it has many
 * knowledge-tree children, OR if it turns up in a large share of the learner's conversations.
 * Main exports: isHubGenericNode, computeNodeConversationCoverage, HUB_LABEL_MAX_LENGTH,
 * HUB_MIN_CHILD_COUNT, HUB_CONVERSATION_COVERAGE_THRESHOLD.
 */
import type { NodeSightingRow } from "@breadcrumb/core-db";

/** Labels shorter than this many characters are too generic to trust alone (spec 043 §7). */
export const HUB_LABEL_MAX_LENGTH = 3;
/** ...unless the tree also treats them as a genuine umbrella: this many children or more. */
export const HUB_MIN_CHILD_COUNT = 5;
/** A node sighted in more than this share of the learner's conversations is a recurring
 * utility word, not something worth its own door (spec 043 §7). */
export const HUB_CONVERSATION_COVERAGE_THRESHOLD = 0.3;

export interface HubNodeInput {
  label: string;
  /** Count of knowledge-tree nodes whose parent_id is this node. */
  childCount: number;
  /** Fraction (0..1) of the learner's conversations that ever sighted this node. */
  conversationCoverage: number;
}

/** True when a node must not become an independent door on its own (spec 043 §7) — it may
 * still receive a nodeId as an enrichment of a term-marked span, just never anchor a
 * standalone legacy-matched door. */
export function isHubGenericNode(input: HubNodeInput): boolean {
  const shortWithManyChildren =
    input.label.length < HUB_LABEL_MAX_LENGTH && input.childCount >= HUB_MIN_CHILD_COUNT;
  const highFrequency = input.conversationCoverage > HUB_CONVERSATION_COVERAGE_THRESHOLD;
  return shortWithManyChildren || highFrequency;
}

/** Per-node share of distinct conversations that ever sighted it, out of every conversation
 * that sighted anything at all. Nodes with zero sightings are simply absent from the returned
 * map (callers treat a missing entry as 0 coverage). */
export function computeNodeConversationCoverage(
  sightings: readonly NodeSightingRow[],
): Map<string, number> {
  const conversationsByNode = new Map<string, Set<string>>();
  const allConversations = new Set<string>();
  for (const sighting of sightings) {
    allConversations.add(sighting.conversation_id);
    const forNode = conversationsByNode.get(sighting.node_id) ?? new Set<string>();
    forNode.add(sighting.conversation_id);
    conversationsByNode.set(sighting.node_id, forNode);
  }
  const total = allConversations.size;
  const coverage = new Map<string, number>();
  if (total === 0) return coverage;
  for (const [nodeId, conversationIds] of conversationsByNode) {
    coverage.set(nodeId, conversationIds.size / total);
  }
  return coverage;
}
