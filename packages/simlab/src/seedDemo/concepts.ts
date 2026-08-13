/**
 * Purpose: turns conceptSpecs.ts's 24 node specs into real KnowledgeNodeRow/NodeSightingRow
 * rows (spec 035 T7b) — skips any label the DB already has, and wires each spec's sightings
 * to the demo conversations built by conversations.ts.
 * Main exports: ConceptSeedResult, buildConceptSeed.
 */
import type { KnowledgeNodeRow, NodeSightingRow } from "@breadcrumb/core-db";
import { ALL_CONCEPT_SPECS } from "./conceptSpecs";
import type { DemoConversationRef } from "./conversations";
import { demoId, isoAt, minutesAgo } from "./shared";

export interface ConceptSeedResult {
  nodes: KnowledgeNodeRow[];
  sightings: NodeSightingRow[];
  nodeIdByLabel: Map<string, string>;
}

/** Builds the 24 nodes (skipping any label the DB already has, per the reversibility contract
 * — a demo run must never collide with the user's real tree) and their sightings. Sightings
 * whose offset is 0 and whose label is in `conversations.messageRefByLabel` attach to the
 * real written message; every other sighting is attributed to its domain's demo conversation
 * with no specific message (message_id null), since only today's dialogue was written out in
 * full — the other ~70 days of history are real footprints without a fabricated transcript. */
export function buildConceptSeed(
  now: Date,
  existingLabels: ReadonlySet<string>,
  conversations: DemoConversationRef,
): ConceptSeedResult {
  const nodeIdByLabel = new Map<string, string>();
  const included = ALL_CONCEPT_SPECS.filter((spec) => !existingLabels.has(spec.label));
  included.forEach((spec, index) => {
    nodeIdByLabel.set(spec.label, demoId("node", index));
  });

  // Sightings first — a node's created_at is its own earliest sighting instant, so the two
  // can never contradict each other (no separate day-math to keep in sync).
  const sightings: NodeSightingRow[] = [];
  const earliestByLabel = new Map<string, string>();
  let sightingCounter = 0;
  for (const spec of included) {
    const nodeId = nodeIdByLabel.get(spec.label);
    if (nodeId === undefined) continue;
    spec.offsetsDays.forEach((offset, rank) => {
      const ref = offset === 0 ? conversations.messageRefByLabel.get(spec.label) : undefined;
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
      });
      const earliest = earliestByLabel.get(spec.label);
      if (earliest === undefined || createdAt < earliest) {
        earliestByLabel.set(spec.label, createdAt);
      }
      sightingCounter += 1;
    });
  }

  const nodes: KnowledgeNodeRow[] = included.map((spec, index) => ({
    id: demoId("node", index),
    parent_id: spec.parentLabel === null ? null : (nodeIdByLabel.get(spec.parentLabel) ?? null),
    label: spec.label,
    summary: spec.summary,
    kind: "concept",
    created_at: earliestByLabel.get(spec.label) ?? minutesAgo(now, 5),
  }));

  return { nodes, sightings, nodeIdByLabel };
}
