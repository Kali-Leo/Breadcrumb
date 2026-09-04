/**
 * Purpose: turns conceptSpecs.ts's 39 node specs into real KnowledgeNodeRow/NodeSightingRow
 * rows (spec 035 T7b) — names and summaries come from the chosen language's demo text, so a
 * spec never carries words; skips any label the DB already has, and wires each spec's
 * sightings to the demo conversations built by conversations.ts.
 * Main exports: ConceptSeedResult, buildConceptSeed.
 */
import type { KnowledgeNodeRow, NodeSightingRow } from "@breadcrumb/core-db";
import { ALL_CONCEPT_SPECS } from "./conceptSpecs";
import type { DemoConversationRef } from "./conversations";
import { demoId, isoAt, minutesAgo } from "./shared";
import type { ConceptId, DemoText } from "./text/demoText";

export interface ConceptSeedResult {
  nodes: KnowledgeNodeRow[];
  sightings: NodeSightingRow[];
  nodeIdById: Map<ConceptId, string>;
}

/** Builds the 39 nodes (skipping any node whose name the DB already has, per the
 * reversibility contract — a demo run must never collide with the user's real tree) and their
 * sightings. Sightings whose offset is 0 and whose concept is in
 * `conversations.messageRefById` attach to the real written message; every other sighting is
 * attributed to its domain's demo conversation with no specific message (message_id null),
 * since only today's dialogue was written out in full — the other ~70 days of history are
 * real footprints without a fabricated transcript. */
export function buildConceptSeed(
  now: Date,
  existingLabels: ReadonlySet<string>,
  conversations: DemoConversationRef,
  text: DemoText,
): ConceptSeedResult {
  const labelOf = (id: ConceptId): string => text.concepts[id][0];
  const nodeIdById = new Map<ConceptId, string>();
  const included = ALL_CONCEPT_SPECS.filter((spec) => !existingLabels.has(labelOf(spec.id)));
  included.forEach((spec, index) => {
    nodeIdById.set(spec.id, demoId("node", index));
  });

  // Sightings first — a node's created_at is its own earliest sighting instant, so the two
  // can never contradict each other (no separate day-math to keep in sync).
  const sightings: NodeSightingRow[] = [];
  const earliestById = new Map<ConceptId, string>();
  let sightingCounter = 0;
  for (const spec of included) {
    const nodeId = nodeIdById.get(spec.id);
    if (nodeId === undefined) continue;
    spec.offsetsDays.forEach((offset, rank) => {
      const ref = offset === 0 ? conversations.messageRefById.get(spec.id) : undefined;
      const conversationId =
        ref?.conversationId ?? conversations.conversationIdByDomain[spec.domain];
      const minute = (sightingCounter * 13 + rank * 7) % 60;
      // offset > 0 is always safely in the past (isoAt); offset === 0 without a written
      // message (none in practice — every offset-0 spec has one) falls back to "a few
      // minutes ago" rather than a fixed clock hour, which could be in the future.
      const createdAt =
        ref?.createdAt ?? (offset > 0 ? isoAt(now, offset, 10, minute) : minutesAgo(now, 5));
      sightings.push({
        id: demoId("sight", sightingCounter),
        node_id: nodeId,
        conversation_id: conversationId,
        message_id: ref?.messageId ?? null,
        created_at: createdAt,
        origin_node_id: null,
      });
      const earliest = earliestById.get(spec.id);
      if (earliest === undefined || createdAt < earliest) {
        earliestById.set(spec.id, createdAt);
      }
      sightingCounter += 1;
    });
  }

  const nodes: KnowledgeNodeRow[] = included.map((spec, index) => ({
    id: demoId("node", index),
    parent_id: spec.parentId === null ? null : (nodeIdById.get(spec.parentId) ?? null),
    label: labelOf(spec.id),
    summary: text.concepts[spec.id][1],
    kind: "concept",
    created_at: earliestById.get(spec.id) ?? minutesAgo(now, 5),
  }));

  return { nodes, sightings, nodeIdById };
}
