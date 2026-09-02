/**
 * Purpose: pure fold of one extraction round's results into the knowledge store's trail
 * state — the round's sightings land in its OWN conversation's layer, while the active
 * mirror and fresh-node highlights only follow when that conversation is on screen
 * (audit fix: a background round must not light up whatever conversation is being viewed).
 * Main exports: foldExtractionIntoTrailState, TrailStateSlice.
 */
import { setConversationLayer } from "../chat/conversationLayers";

export interface TrailStateSlice {
  sessionNodeIds: string[];
  trailByConversation: ReadonlyMap<string, string[]>;
  freshNodeIds: ReadonlySet<string>;
}

interface ExtractionRoundResult {
  conversationId: string;
  isViewingThisConversation: boolean;
  /** Node ids sighted this round, in extraction order. */
  sightedNodeIds: readonly string[];
  /** Node ids born this round (the highlight set). */
  freshNodeIds: readonly string[];
}

export function foldExtractionIntoTrailState(
  state: TrailStateSlice,
  round: ExtractionRoundResult,
): TrailStateSlice {
  const layeredTrail = state.trailByConversation.get(round.conversationId);
  // A conversation whose layer was never filled stays unfilled — the round's sightings are
  // already persisted, so its fill-on-first-visit load will include them; writing a partial
  // layer here would make that load believe it is fully cached.
  const baseTrail =
    layeredTrail ?? (round.isViewingThisConversation ? state.sessionNodeIds : undefined);
  const appendedTrail =
    baseTrail === undefined
      ? undefined
      : [...baseTrail, ...round.sightedNodeIds.filter((nodeId) => !baseTrail.includes(nodeId))];
  return {
    trailByConversation:
      layeredTrail === undefined || appendedTrail === undefined
        ? state.trailByConversation
        : setConversationLayer(state.trailByConversation, round.conversationId, appendedTrail),
    sessionNodeIds:
      round.isViewingThisConversation && appendedTrail !== undefined
        ? appendedTrail
        : state.sessionNodeIds,
    // Fresh highlights are view-scoped flare for the round that just finished on screen —
    // a background round keeps whatever the viewed conversation is showing.
    freshNodeIds: round.isViewingThisConversation
      ? new Set(round.freshNodeIds)
      : state.freshNodeIds,
  };
}
