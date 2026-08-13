/**
 * Purpose: cumulative, never-decreasing totals for the feedback lab's "累计" module — the
 * streak metaphor's effective core (investment made visible) without the reset anxiety
 * (spec 035 #3).
 * Main exports: CumulativeTotals, computeCumulativeTotals.
 */
import type { ConversationRow, DiglotWordStateRow, NodeSightingRow } from "@breadcrumb/core-db";
import { cardFromJson } from "@breadcrumb/plugin-diglot-weave";
import { WORD_SETTLED_STABILITY_DAYS } from "./settled";

export interface CumulativeTotals {
  conceptsMet: number;
  totalEncounters: number;
  wordsLearning: number;
  wordsSettled: number;
  conversationCount: number;
}

/** conceptsMet/totalEncounters come from sightings; wordsLearning/wordsSettled split the
 * diglot word states by the same stability bar settled.ts uses; conversationCount only
 * counts ordinary 'chat' threads (practice/teach offshoots are not standing conversations). */
export function computeCumulativeTotals(input: {
  sightings: readonly NodeSightingRow[];
  wordStates: readonly DiglotWordStateRow[];
  conversations: readonly ConversationRow[];
}): CumulativeTotals {
  const conceptsMet = new Set(input.sightings.map((sighting) => sighting.node_id)).size;
  const totalEncounters = input.sightings.length;

  let wordsLearning = 0;
  let wordsSettled = 0;
  for (const state of input.wordStates) {
    const stabilityDays = cardFromJson(state.fsrs_json).stability;
    if (stabilityDays >= WORD_SETTLED_STABILITY_DAYS) {
      wordsSettled += 1;
    } else {
      wordsLearning += 1;
    }
  }

  const conversationCount = input.conversations.filter(
    (conversation) => conversation.kind === "chat",
  ).length;

  return { conceptsMet, totalEncounters, wordsLearning, wordsSettled, conversationCount };
}
