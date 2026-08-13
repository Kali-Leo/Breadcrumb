/**
 * Purpose: "今日一份" — the minimal daily task (a capped count of today's reunions plus
 * today's new concepts), goal-gradient framed but never punishing an incomplete day
 * (spec 035 #5).
 * Main exports: DailyBiteResult, computeDailyBite.
 */
import type { NodeSightingRow } from "@breadcrumb/core-db";

/** Local calendar date key for an ISO instant, matching activity.ts's day-cutting rule. */
function toLocalDateKey(iso: string): string {
  const instant = new Date(iso);
  const year = instant.getFullYear();
  const month = String(instant.getMonth() + 1).padStart(2, "0");
  const day = String(instant.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export interface DailyBiteResult {
  reunionsDone: number;
  newDone: number;
  reunionTarget: number;
  newTarget: number;
  complete: boolean;
}

/** reunionsDone = distinct nodes met today whose very first sighting was before today
 * (capped at reunionTarget); newDone = distinct nodes met today for the very first time
 * (capped at newTarget). */
export function computeDailyBite(input: {
  sightings: readonly NodeSightingRow[];
  todayIso: string;
  reunionTarget: number;
  newTarget: number;
}): DailyBiteResult {
  const { sightings, todayIso, reunionTarget, newTarget } = input;
  const todayKey = toLocalDateKey(todayIso);

  const sortedSightings = [...sightings].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const firstSightingByNode = new Map<string, string>();
  for (const sighting of sortedSightings) {
    if (!firstSightingByNode.has(sighting.node_id)) {
      firstSightingByNode.set(sighting.node_id, sighting.created_at);
    }
  }

  const nodesMetToday = new Set<string>();
  for (const sighting of sortedSightings) {
    if (toLocalDateKey(sighting.created_at) === todayKey) {
      nodesMetToday.add(sighting.node_id);
    }
  }

  let newCount = 0;
  let reunionCount = 0;
  for (const nodeId of nodesMetToday) {
    const firstEver = firstSightingByNode.get(nodeId);
    if (firstEver !== undefined && toLocalDateKey(firstEver) === todayKey) {
      newCount += 1;
    } else {
      reunionCount += 1;
    }
  }

  const reunionsDone = Math.min(reunionCount, reunionTarget);
  const newDone = Math.min(newCount, newTarget);
  return {
    reunionsDone,
    newDone,
    reunionTarget,
    newTarget,
    complete: reunionsDone >= reunionTarget && newDone >= newTarget,
  };
}
