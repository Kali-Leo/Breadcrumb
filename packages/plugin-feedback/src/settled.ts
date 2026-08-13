/**
 * Purpose: "已长期掌握" confirmation lists — nodes with enough real encounters and high
 * current retention, and diglot words whose FSRS stability has crossed the settle bar
 * (spec 035 #7).
 * Main exports: NODE_SETTLED_ENCOUNTER_COUNT, NODE_SETTLED_RETENTION,
 * WORD_SETTLED_STABILITY_DAYS, SettledNode, SettledWord, computeSettled.
 */
import type { DiglotWordStateRow, NodeSightingRow } from "@breadcrumb/core-db";
import { cardFromJson } from "@breadcrumb/plugin-diglot-weave";

/** Node settle bar (spec 035 #7): at least 4 real encounters — one encounter is too thin a
 * sample to trust — and current retention at/above 90%, matching the FSRS true-retention
 * target systemGauge.ts evaluates the schedule against. */
export const NODE_SETTLED_ENCOUNTER_COUNT = 4;
export const NODE_SETTLED_RETENTION = 0.9;

/** Word settle bar (spec 035 #7): FSRS stability at/above 30 days — a month-plus forgetting
 * half-life is the same long-horizon bar WaniKani's "Burned" tier uses to say a word no
 * longer needs review. */
export const WORD_SETTLED_STABILITY_DAYS = 30;

export interface SettledNode {
  nodeId: string;
  title: string;
  encounterCount: number;
}

export interface SettledWord {
  lemma: string;
  stabilityDays: number;
}

export interface SettledResult {
  nodes: SettledNode[];
  words: SettledWord[];
}

/** Both lists are sorted most-settled first; truncation for display is the UI's call. */
export function computeSettled(input: {
  sightings: readonly NodeSightingRow[];
  nodeTitleById: ReadonlyMap<string, string>;
  retentionByNode: ReadonlyMap<string, number>;
  wordStates: readonly DiglotWordStateRow[];
}): SettledResult {
  const encounterCountByNode = new Map<string, number>();
  for (const sighting of input.sightings) {
    encounterCountByNode.set(
      sighting.node_id,
      (encounterCountByNode.get(sighting.node_id) ?? 0) + 1,
    );
  }

  const nodes: SettledNode[] = [];
  for (const [nodeId, encounterCount] of encounterCountByNode) {
    if (encounterCount < NODE_SETTLED_ENCOUNTER_COUNT) continue;
    const retention = input.retentionByNode.get(nodeId) ?? 0;
    if (retention < NODE_SETTLED_RETENTION) continue;
    nodes.push({ nodeId, title: input.nodeTitleById.get(nodeId) ?? nodeId, encounterCount });
  }
  nodes.sort((a, b) => b.encounterCount - a.encounterCount);

  const words: SettledWord[] = [];
  for (const state of input.wordStates) {
    const stabilityDays = cardFromJson(state.fsrs_json).stability;
    if (stabilityDays >= WORD_SETTLED_STABILITY_DAYS) {
      words.push({ lemma: state.lemma, stabilityDays });
    }
  }
  words.sort((a, b) => b.stabilityDays - a.stabilityDays);

  return { nodes, words };
}
