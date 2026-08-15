/**
 * Purpose: one-shot fetch of the tables the surviving mirror cards read (spec 035 → 048)
 * plus assembly of their view models via @breadcrumb/plugin-feedback's pure functions.
 * Main exports: FeedbackData, loadFeedbackData.
 */
import type { DiglotWordStateRow } from "@breadcrumb/core-db";
import {
  computeContinuity,
  computeDailyActivity,
  computeSettled,
  type DailyActivityCell,
  type SettledResult,
} from "@breadcrumb/plugin-feedback";
import { computeRetentionByNode } from "@breadcrumb/plugin-memory";
import { getRepos } from "./db";
import { nowIso } from "./time";

/** 365 days of heatmap history — the figure the spec's copy templates were tested against. */
const HEATMAP_DAYS = 365;

export interface FeedbackData {
  cells: DailyActivityCell[];
  continuity: { activeDays: number; longestRunDays: number; currentRunDays: number };
  settled: SettledResult;
}

/** Fetches sightings, the node tree, conversations and every installed diglot pack's word
 * states/guesses, then computes the heatmap and settled view models. */
export async function loadFeedbackData(): Promise<FeedbackData> {
  const repos = await getRepos();
  const now = nowIso();

  const [sightings, nodes, conversations, packs] = await Promise.all([
    repos.nodeSightings.listAll(),
    repos.knowledgeNodes.listAll(),
    repos.conversations.listRecentFirst(),
    repos.diglot.listPacks(),
  ]);
  const statesByPack = await Promise.all(packs.map((pack) => repos.diglot.listStates(pack.id)));
  const guessesByPack = await Promise.all(packs.map((pack) => repos.diglot.listGuesses(pack.id)));
  const wordStates: DiglotWordStateRow[] = statesByPack.flat();
  const guesses = guessesByPack.flat();

  const nodeTitleById = new Map(nodes.map((node) => [node.id, node.label]));
  const retentionByNode = computeRetentionByNode(sightings, now);

  // Heatmap footprint: node encounters, word guesses, and one mark per conversation opened —
  // the closest zero-migration proxy for "a message happened that day" (no message.listAll).
  const cells = computeDailyActivity(
    [
      ...sightings.map((sighting) => sighting.created_at),
      ...guesses.map((guess) => guess.created_at),
      ...conversations.map((conversation) => conversation.created_at),
    ],
    { days: HEATMAP_DAYS, todayIso: now },
  );
  const continuity = computeContinuity(cells);

  const settled = computeSettled({ sightings, nodeTitleById, retentionByNode, wordStates });

  return { cells, continuity, settled };
}
