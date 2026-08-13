/**
 * Purpose: one-shot fetch of every table the 🪞 feedback lab reads (spec 035) plus assembly
 * of all module view models — including the T6 trend series — via @breadcrumb/plugin-feedback's
 * pure functions.
 * Main exports: FeedbackData, EvidenceCandidate, loadFeedbackData.
 */
import type {
  DiglotWordEventRow,
  DiglotWordGuessRow,
  DiglotWordStateRow,
  MasteryClaimRow,
  NodeSightingRow,
} from "@breadcrumb/core-db";
import {
  type CumulativeTotals,
  computeContinuity,
  computeCumulativeConceptSeries,
  computeCumulativeTotals,
  computeDailyActivity,
  computeDailyBite,
  computeKnowledgeSumSeries,
  computeSettled,
  computeSmallWins,
  computeSystemGauge,
  computeWordSeenSeries,
  computeWordSettledSeries,
  type DailyActivityCell,
  type DailyBiteResult,
  DEFAULT_REUNION_WAITING_THRESHOLD,
  pickReunionInvites,
  type ReunionInvite,
  type SettledResult,
  type SmallWin,
  type SystemGaugeResult,
  TREND_WINDOW_DAYS,
  type TrendPoint,
} from "@breadcrumb/plugin-feedback";
import { computeRetentionByNode } from "@breadcrumb/plugin-memory";
import { getRepos } from "./db";
import { nowIso, todayLocalMidnightIso } from "./time";

/** 365 days of heatmap history, three reunions and one new concept a day, three reunion
 * invites shown at once — the same figures the spec's copy templates were tested against. */
const HEATMAP_DAYS = 365;
const REUNION_INVITE_LIMIT = 3;
const DAILY_REUNION_TARGET = 3;
const DAILY_NEW_TARGET = 1;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface EvidenceCandidate {
  nodeId: string;
  title: string;
  lastSeenIso: string;
}

export interface FeedbackData {
  cells: DailyActivityCell[];
  continuity: { activeDays: number; longestRunDays: number; currentRunDays: number };
  smallWinsToday: SmallWin[];
  smallWinsWeek: SmallWin[];
  totals: CumulativeTotals;
  reunion: { waitingCount: number; invites: ReunionInvite[] };
  dailyBite: DailyBiteResult;
  systemGauge: SystemGaugeResult;
  settled: SettledResult;
  evidenceCandidates: EvidenceCandidate[];
  trends: {
    concepts: TrendPoint[];
    knowledge: TrendPoint[];
    wordsSeen: TrendPoint[];
    wordsSettled: TrendPoint[];
  };
  // Raw rows kept around so the evidence section can call buildNodeEvidence on demand
  // without a second round-trip — it is pure and cheap given data already in memory.
  sightings: NodeSightingRow[];
  conversationTitlesById: Map<string, string>;
  retentionByNode: Map<string, number>;
  masteryClaims: MasteryClaimRow[];
}

/** Fetches sightings, the node tree, conversations, mastery claims and every installed
 * diglot pack's word states/guesses, then computes all eight modules' view models. Frequent
 * full pulls of sightings match the 🧪 lab panel's existing scale (spec 035 §架构). */
export async function loadFeedbackData(): Promise<FeedbackData> {
  const repos = await getRepos();
  const now = nowIso();
  const todayMidnight = todayLocalMidnightIso();
  const weekAgo = new Date(Date.parse(todayMidnight) - 6 * MS_PER_DAY).toISOString();

  const [sightings, nodes, conversations, masteryClaims, packs] = await Promise.all([
    repos.nodeSightings.listAll(),
    repos.knowledgeNodes.listAll(),
    repos.conversations.listRecentFirst(),
    repos.masteryClaims.listAll(),
    repos.diglot.listPacks(),
  ]);
  const statesByPack = await Promise.all(packs.map((pack) => repos.diglot.listStates(pack.id)));
  const guessesByPack = await Promise.all(packs.map((pack) => repos.diglot.listGuesses(pack.id)));
  const eventsByPack = await Promise.all(packs.map((pack) => repos.diglot.listAllEvents(pack.id)));
  const wordStates: DiglotWordStateRow[] = statesByPack.flat();
  const guesses: DiglotWordGuessRow[] = guessesByPack.flat();
  const wordEvents: DiglotWordEventRow[] = eventsByPack.flat();

  const nodeTitleById = new Map(nodes.map((node) => [node.id, node.label]));
  const conversationTitlesById = new Map(conversations.map((c) => [c.id, c.title]));
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

  const smallWinsToday = computeSmallWins({
    sightings,
    nodeTitleById,
    guesses,
    teachConversations: conversations,
    window: { sinceIso: todayMidnight, nowIso: now },
  });
  const smallWinsWeek = computeSmallWins({
    sightings,
    nodeTitleById,
    guesses,
    teachConversations: conversations,
    window: { sinceIso: weekAgo, nowIso: now },
  });

  const totals = computeCumulativeTotals({ sightings, wordStates, conversations });

  const reunion = pickReunionInvites(retentionByNode, nodeTitleById, {
    limit: REUNION_INVITE_LIMIT,
    waitingThreshold: DEFAULT_REUNION_WAITING_THRESHOLD,
  });

  const dailyBite = computeDailyBite({
    sightings,
    todayIso: now,
    reunionTarget: DAILY_REUNION_TARGET,
    newTarget: DAILY_NEW_TARGET,
  });

  const systemGauge = computeSystemGauge({ sightings, guesses, nowIso: now });

  const settled = computeSettled({ sightings, nodeTitleById, retentionByNode, wordStates });

  const trendWindow = { days: TREND_WINDOW_DAYS, todayIso: now };
  const trends = {
    concepts: computeCumulativeConceptSeries(sightings, trendWindow),
    knowledge: computeKnowledgeSumSeries(sightings, trendWindow),
    wordsSeen: computeWordSeenSeries(wordStates, trendWindow),
    wordsSettled: computeWordSettledSeries(wordEvents, wordStates, trendWindow),
  };

  const lastSeenByNode = new Map<string, string>();
  for (const sighting of sightings) {
    const current = lastSeenByNode.get(sighting.node_id);
    if (current === undefined || sighting.created_at > current) {
      lastSeenByNode.set(sighting.node_id, sighting.created_at);
    }
  }
  const evidenceCandidates: EvidenceCandidate[] = [...lastSeenByNode.entries()]
    .map(([nodeId, lastSeenIso]) => ({
      nodeId,
      title: nodeTitleById.get(nodeId) ?? nodeId,
      lastSeenIso,
    }))
    .sort((a, b) => b.lastSeenIso.localeCompare(a.lastSeenIso));

  return {
    cells,
    continuity,
    smallWinsToday,
    smallWinsWeek,
    totals,
    reunion,
    dailyBite,
    systemGauge,
    settled,
    evidenceCandidates,
    trends,
    sightings,
    conversationTitlesById,
    retentionByNode,
    masteryClaims,
  };
}
