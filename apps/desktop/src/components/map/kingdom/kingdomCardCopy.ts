/**
 * Purpose: the node card's sentences (spec 049) — one plain, suggest-only reason for the
 * current invitation, the plain state statement, and the state-worded main action key.
 * Copy selection only; no rendering.
 * Main exports: reasonMessage, stateMessage, MAIN_ACTION_KEY.
 */
import type { CopyMessage } from "@breadcrumb/core-i18n";
import type { FrontierCandidate } from "@breadcrumb/feature-planner";
import type { KingdomViewNode } from "../../../lib/map/kingdomView";

/** One plain, suggest-only sentence for why this node is the current invitation. */
export function reasonMessage(candidate: FrontierCandidate, listSeparator: string): CopyMessage {
  if (candidate.reason.litPrerequisiteLabels.length > 0) {
    return {
      key: "palace:kingdom.reasonPrereq",
      params: { labels: candidate.reason.litPrerequisiteLabels.join(listSeparator) },
    };
  }
  if (candidate.reason.wasLitBefore) return { key: "palace:kingdom.reasonWasLit" };
  if (candidate.reason.gatewayTo) {
    return {
      key: "palace:kingdom.reasonGateway",
      params: { label: candidate.reason.gatewayTo.label },
    };
  }
  return { key: "palace:kingdom.reasonDefault" };
}

export function stateMessage(node: KingdomViewNode, lastSeenDate: string | null): CopyMessage {
  if (node.state === "done") {
    return lastSeenDate === null
      ? { key: "palace:kingdom.stateDone" }
      : { key: "palace:kingdom.stateDoneSeen", params: { date: lastSeenDate } };
  }
  if (node.state === "visited") {
    return lastSeenDate === null
      ? { key: "palace:kingdom.stateVisited" }
      : { key: "palace:kingdom.stateVisitedSeen", params: { date: lastSeenDate } };
  }
  return { key: "palace:kingdom.stateUntouched" };
}

export const MAIN_ACTION_KEY = {
  untouched: "kingdom.actionUntouched",
  visited: "kingdom.actionVisited",
  done: "kingdom.actionDone",
} as const;
