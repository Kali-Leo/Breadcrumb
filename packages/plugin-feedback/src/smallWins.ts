/**
 * Purpose: the "微进展" list — concrete, dated things that happened inside a window (new
 * concepts, reencountered concepts, word guesses, teach-back sessions), spec 035 #2.
 * Main exports: SmallWin, SmallWinKind, SmallWinsInput, computeSmallWins.
 */
import type { ConversationRow, DiglotWordGuessRow, NodeSightingRow } from "@breadcrumb/core-db";
import type { CopyMessage } from "@breadcrumb/core-i18n";
import {
  newConceptMessage,
  reencounterMessage,
  teachSessionMessage,
  wordGuessMessage,
} from "./uiCopy";

export type SmallWinKind = "new-concept" | "reencounter" | "word-guess" | "teach-session";

export interface SmallWin {
  kind: SmallWinKind;
  /** The sentence to render, as a catalogue key plus its values (spec 058 §2). */
  message: CopyMessage;
  occurredAtIso: string;
}

export interface SmallWinsInput {
  /** All sightings, ascending or any order — used both to find each node's very first
   * encounter (which may be before the window) and window-local encounters. */
  sightings: readonly NodeSightingRow[];
  nodeTitleById: ReadonlyMap<string, string>;
  guesses?: readonly DiglotWordGuessRow[];
  teachConversations?: readonly ConversationRow[];
  window: { sinceIso: string; nowIso: string };
}

/** New concepts and reencounters (this run), word guesses and teach sessions (newest
 * first), all inside `window`. */
export function computeSmallWins(input: SmallWinsInput): SmallWin[] {
  const { sightings, nodeTitleById, guesses = [], teachConversations = [], window } = input;
  const inWindow = (iso: string): boolean => iso >= window.sinceIso && iso <= window.nowIso;

  const sortedSightings = [...sightings].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const firstSightingByNode = new Map<string, string>();
  for (const sighting of sortedSightings) {
    if (!firstSightingByNode.has(sighting.node_id)) {
      firstSightingByNode.set(sighting.node_id, sighting.created_at);
    }
  }

  const windowSightingTimesByNode = new Map<string, string[]>();
  for (const sighting of sortedSightings) {
    if (!inWindow(sighting.created_at)) continue;
    const times = windowSightingTimesByNode.get(sighting.node_id) ?? [];
    times.push(sighting.created_at);
    windowSightingTimesByNode.set(sighting.node_id, times);
  }

  const wins: SmallWin[] = [];
  for (const [nodeId, times] of windowSightingTimesByNode) {
    const title = nodeTitleById.get(nodeId) ?? nodeId;
    const firstEver = firstSightingByNode.get(nodeId);
    const latestInWindow = times[times.length - 1] ?? window.sinceIso;
    if (firstEver !== undefined && firstEver >= window.sinceIso) {
      wins.push({
        kind: "new-concept",
        message: newConceptMessage(title),
        occurredAtIso: firstEver,
      });
    } else {
      wins.push({
        kind: "reencounter",
        message: reencounterMessage(title),
        occurredAtIso: latestInWindow,
      });
    }
  }

  const latestGuessByLemma = new Map<string, DiglotWordGuessRow>();
  for (const guess of guesses) {
    if (guess.grade === "wrong") continue;
    if (!inWindow(guess.created_at)) continue;
    const existing = latestGuessByLemma.get(guess.lemma);
    if (existing === undefined || guess.created_at > existing.created_at) {
      latestGuessByLemma.set(guess.lemma, guess);
    }
  }
  for (const guess of latestGuessByLemma.values()) {
    wins.push({
      kind: "word-guess",
      message: wordGuessMessage(guess.lemma, guess.grade === "close"),
      occurredAtIso: guess.created_at,
    });
  }

  for (const conversation of teachConversations) {
    if (conversation.kind !== "teach") continue;
    if (!inWindow(conversation.created_at)) continue;
    wins.push({
      kind: "teach-session",
      message: teachSessionMessage(conversation.title),
      occurredAtIso: conversation.created_at,
    });
  }

  return wins.sort((a, b) => b.occurredAtIso.localeCompare(a.occurredAtIso));
}
