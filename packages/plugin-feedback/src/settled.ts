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
 * sample to trust — and current retention at/above 90%, which is FSRS's own default
 * request_retention (ts-fsrs `default_request_retention = 0.9`): the rate the schedule is
 * built to hold, so "at or above it" means the schedule considers this one safe.
 * (Earlier this comment cited a systemGauge.ts as the source of that target; no such module
 * exists in this repo — 2026-08-28 design audit.) */
export const NODE_SETTLED_ENCOUNTER_COUNT = 4;
export const NODE_SETTLED_RETENTION = 0.9;

/** Word settle bar (spec 035 #7): FSRS stability at/above 30 days — a month-plus forgetting
 * half-life. The anchor is the Anki community's "mature = interval >= 21 days" convention,
 * which this repo's own survey (docs/research/2026-08-13-折线指标-纵向学习度量调研.md) took as
 * the honest lower bound for "actually learned"; 30 days sits just past it.
 * (Earlier this comment credited WaniKani's "Burned" tier. That is wrong: Burned is reached
 * at roughly 4 months; the tier that sits near 30 days is "Master" — 2026-08-28 design audit.
 * The number is unchanged, only the citation.) */
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
