/**
 * Purpose: assembles hindsight events for the adaptive conversation:browsing trust ratio
 * (spec 060 §5). For each recent "first went to study a new node" moment, it reconstructs
 * what both interest signals looked like just before that moment and asks which one ranked
 * the node higher among the then-untouched pool; the pure ratio math lives in
 * plugin-browsing-interest/trustRatio. Refreshes once per local day (the palace's rhythm).
 * Main exports: computeBrowsingTrustRatio.
 */
import type {
  InterestSignalRow,
  KnowledgeNodeRow,
  NodeEmbeddingRow,
  NodeSightingRow,
} from "@breadcrumb/core-db";
import {
  BROWSING_TRUST_DEFAULT,
  browsingAffinityByNode,
  type HindsightEvent,
  hindsightTrustRatio,
  midrankPercentile,
  watchedTitleWeight,
} from "@breadcrumb/plugin-browsing-interest";
import {
  aggregateInterest,
  DEFAULT_SPREAD_FACTOR,
  spreadInterest,
} from "@breadcrumb/plugin-interest";
import { parseNodeVectors, type WatchedTitleRecord } from "./browsingAffinity";
import { startOfLocalDayIso } from "./layoutDay";

/** Most recent outcomes only — behaviour from months ago speaks for a different learner. */
const MAX_EVENTS = 40;
/** A percentile needs a landscape: fewer untouched peers than this and the event is skipped. */
const MIN_POOL_SIZE = 10;
/** Reconstruction is O(events × nodes²) through spreadInterest; above this tree size, sit
 * out with the default until the O(n²) → ANN index rework (2026-08-16 审计遗留 #2) lands. */
const MAX_NODES = 300;

let cached: { dayStartIso: string; ratio: number } | null = null;

/** First sighting instant per node, oldest first. */
function firstTouches(sightings: readonly NodeSightingRow[]): { nodeId: string; at: string }[] {
  const earliest = new Map<string, string>();
  for (const sighting of sightings) {
    const existing = earliest.get(sighting.node_id);
    if (existing === undefined || sighting.created_at < existing) {
      earliest.set(sighting.node_id, sighting.created_at);
    }
  }
  return [...earliest.entries()]
    .map(([nodeId, at]) => ({ nodeId, at }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

function browsingScoresAt(
  atMillis: number,
  titles: readonly WatchedTitleRecord[],
  nodeVectors: ReadonlyMap<string, readonly number[]>,
): Map<string, number> {
  const rewound = titles
    .filter((title) => title.ts * 1000 < atMillis)
    .map((title) => ({
      ...title,
      weight: watchedTitleWeight(title.finished, (atMillis / 1000 - title.ts) / 86_400),
    }));
  return browsingAffinityByNode(rewound, nodeVectors);
}

/**
 * The adaptive ratio for today, or the cold-start default when data is thin (the pure layer
 * guards event counts; this layer guards tree size and pool sizes). Cached per local day —
 * outcomes accumulate on a daily clock and the reconstruction is not free.
 */
export function computeBrowsingTrustRatio(
  nodes: readonly KnowledgeNodeRow[],
  sightings: readonly NodeSightingRow[],
  signals: readonly InterestSignalRow[],
  embeddings: readonly NodeEmbeddingRow[],
  titles: readonly WatchedTitleRecord[],
): number {
  const dayStartIso = startOfLocalDayIso();
  if (cached !== null && cached.dayStartIso === dayStartIso) return cached.ratio;
  const ratio = estimate(nodes, sightings, signals, embeddings, titles);
  cached = { dayStartIso, ratio };
  return ratio;
}

function estimate(
  nodes: readonly KnowledgeNodeRow[],
  sightings: readonly NodeSightingRow[],
  signals: readonly InterestSignalRow[],
  embeddings: readonly NodeEmbeddingRow[],
  titles: readonly WatchedTitleRecord[],
): number {
  if (nodes.length > MAX_NODES || titles.length === 0) return BROWSING_TRUST_DEFAULT;
  const nodeVectors = parseNodeVectors(embeddings);
  const touches = firstTouches(sightings);
  const touchIndexByNode = new Map(touches.map((touch, index) => [touch.nodeId, index]));

  const events: HindsightEvent[] = [];
  for (let index = touches.length - 1; index >= 0 && events.length < MAX_EVENTS; index -= 1) {
    const touch = touches[index];
    if (touch === undefined) continue;
    // The then-untouched pool: nodes first touched strictly later, or never touched at all.
    const pool = nodes.filter((node) => {
      const touchedAt = touchIndexByNode.get(node.id);
      return node.id !== touch.nodeId && (touchedAt === undefined || touchedAt > index);
    });
    if (pool.length < MIN_POOL_SIZE) continue;

    const priorSignals = signals.filter((signal) => signal.created_at < touch.at);
    const interestScores = spreadInterest(
      new Map(
        [...aggregateInterest(priorSignals, touch.at)].map(([nodeId, score]) => [
          nodeId,
          score.curiosity,
        ]),
      ),
      embeddings,
      DEFAULT_SPREAD_FACTOR,
    );
    const browsingScores = browsingScoresAt(Date.parse(touch.at), titles, nodeVectors);

    const poolInterest = pool.map((node) => interestScores.get(node.id) ?? 0);
    const poolBrowsing = pool.map((node) => browsingScores.get(node.id) ?? 0);
    events.push({
      interestPercentile: midrankPercentile(poolInterest, interestScores.get(touch.nodeId) ?? 0),
      browsingPercentile: midrankPercentile(poolBrowsing, browsingScores.get(touch.nodeId) ?? 0),
    });
  }
  return hindsightTrustRatio(events);
}
