/**
 * Purpose: app side of behavioral placement (spec 033, audit 2026-08-28 #2) — supplies the
 * facts the module's placement rules need (is this the word's first encounter ever, its queue
 * rank, how many words have been introduced) and folds one signal into the introduction
 * floor. Side effects: one DB read of the word's event log.
 * Main exports: nextPlacementState.
 */
import type { DiglotEventKind, DiglotPairId } from "@breadcrumb/core-db";
import {
  createPlacementTracker,
  type LoadedLanguagePack,
  type PlacementState,
} from "@breadcrumb/feature-diglot-weave";
import type { Card } from "ts-fsrs";
import { getRepos } from "../platform/db";

/** Session-scoped: it holds this session's unlooked-up first encounters until the same
 * message proves the learner was reading it rather than scrolling past. */
const placementTracker = createPlacementTracker();

/**
 * The placement state after this signal, or null when nothing moved. Callers persist the
 * result quietly — the floor only affects FUTURE new-word picks, so no weave invalidation is
 * needed.
 */
export async function nextPlacementState(input: {
  pairId: DiglotPairId;
  state: PlacementState;
  lemma: string;
  kind: DiglotEventKind;
  messageId: string | null;
  card: Card;
  loaded: LoadedLanguagePack;
  /** Words with an FSRS card — the evidence budget for how far the floor may claim. */
  introducedWordCount: number;
}): Promise<PlacementState | null> {
  const repos = await getRepos();
  // First encounter is decided against the event log, not an in-memory set: a restarted
  // session re-fires viewport exposures for old messages, and those must not count as fresh
  // evidence a second time (DiglotText's exposedMessages cannot see across runs).
  const firstEncounter =
    input.card.reps === 0 &&
    (await repos.diglot.listRecentEvents(input.pairId, input.lemma, 1)).length === 0;
  const next = placementTracker.fold(
    input.state,
    {
      kind: input.kind,
      lemma: input.lemma,
      messageId: input.messageId,
      wordRank: input.loaded.introductionRankByLemma.get(input.lemma) ?? null,
      firstEncounter,
    },
    {
      queueLength: input.loaded.introductionQueue.length,
      introducedWordCount: input.introducedWordCount,
    },
  );
  const unchanged =
    next.introductionRankFloor === input.state.introductionRankFloor &&
    next.placementStep === input.state.placementStep;
  return unchanged ? null : next;
}
