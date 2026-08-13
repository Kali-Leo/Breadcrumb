/**
 * Purpose: "证据可检视" — the open-learner-model view of one node's mastery judgment
 * (encounters with their source conversation, current retention, mastery claims), spec 035
 * #8.
 * Main exports: NodeEvidence, NodeEvidenceEncounter, NodeEvidenceClaim, buildNodeEvidence.
 */
import type { MasteryClaimLevel, MasteryClaimRow, NodeSightingRow } from "@breadcrumb/core-db";

export interface NodeEvidenceEncounter {
  occurredAtIso: string;
  conversationTitle: string;
}

export interface NodeEvidenceClaim {
  level: MasteryClaimLevel;
  occurredAtIso: string;
}

export interface NodeEvidence {
  nodeId: string;
  encounters: NodeEvidenceEncounter[];
  retention: number | null;
  claims: NodeEvidenceClaim[];
}

/** Both lists are chronological (oldest first) — the evidence reads as the node's own
 * history, not a leaderboard. */
export function buildNodeEvidence(
  nodeId: string,
  input: {
    sightings: readonly NodeSightingRow[];
    conversationTitlesById: ReadonlyMap<string, string>;
    retention: number | null;
    masteryClaims: readonly MasteryClaimRow[];
  },
): NodeEvidence {
  const encounters = input.sightings
    .filter((sighting) => sighting.node_id === nodeId)
    .map((sighting) => ({
      occurredAtIso: sighting.created_at,
      conversationTitle:
        input.conversationTitlesById.get(sighting.conversation_id) ?? sighting.conversation_id,
    }))
    .sort((a, b) => a.occurredAtIso.localeCompare(b.occurredAtIso));

  const claims = input.masteryClaims
    .filter((claim) => claim.node_id === nodeId)
    .map((claim) => ({ level: claim.level, occurredAtIso: claim.created_at }))
    .sort((a, b) => a.occurredAtIso.localeCompare(b.occurredAtIso));

  return { nodeId, encounters, retention: input.retention, claims };
}
