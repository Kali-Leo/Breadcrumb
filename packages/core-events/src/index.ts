/**
 * Purpose: the typed event map the application bus (core-bus) is generic over. Breadcrumb
 * has no runtime plugin system — "feature-*" packages are feature modules compiled in like
 * any other code.
 * Main exports: BreadcrumbEventMap, BreadcrumbEventName.
 */

/**
 * Global event map: event name -> payload shape.
 * Grows as features land; modules subscribe via the typed bus, never by string guessing.
 */
export interface BreadcrumbEventMap {
  "app:launched": { launchedAt: string };
  "chat:messageSent": { conversationId: string; messageId: string; sentAt: string };
  "chat:responseFinished": {
    conversationId: string;
    messageId: string;
    finishedAt: string;
    /** Anchored node captured at send time — extraction stamps sighting provenance with it;
     * reading the store minutes later races against anchor changes. */
    anchoredNodeId: string | null;
  };
  "factcheck:finished": { conversationId: string; messageId: string; runId: string };
  /** Fired after knowledge-tree extraction lands new nodes (and their embeddings); the
   * edge pipeline keys off this instead of racing a fixed timer.
   * touchedNodeIds = every node sighted this round (new or re-sighted); freshNodeIds is
   * the new-only subset kept for backward-compatible highlighting. */
  "knowledge:nodesExtracted": {
    conversationId: string;
    freshNodeIds: string[];
    touchedNodeIds: string[];
    /** The assistant reply this round's nodes were extracted from — provenance the edge
     * pipeline stores on every edge it records. */
    sourceMessageId: string;
  };
  /** Ask the shell to switch to the chat view with a conversation open — used by the
   * comparison tree's practice discussions. */
  "app:navigateChat": { conversationId: string };
  /** Ask the palace to open its goal view — emitted by the sidebar's goal card, which
   * lives outside the palace component tree. */
  "palace:openGoalView": Record<string, never>;
  /** Open a companion/helper conversation in the floating chat popup instead of the main
   * chat view. */
  "companion:openPopup": { conversationId: string; title: string };
  /** Fired after new knowledge_edges rows land; the experiment panel refreshes on this
   * instead of polling. */
  "knowledge:edgesUpdated": { addedEdgeIds: string[] };
  /** Fired after interest_signals rows land for a round. */
  "interest:updated": { nodeIds: string[] };
  /** Fired after mastery_claims rows land, e.g. from the self-report action. */
  "mastery:updated": { changedNodeIds: string[] };
  /** Prefills one composer's draft without sending (the user still presses send
   * themselves). conversationId addresses the composer bound to that
   * conversation — null addresses the new-conversation composer; without it, every mounted
   * composer (main view + popup) would apply the same prefill. */
  "composer:prefill": { text: string; conversationId: string | null };
  /** Station map click -> scroll chat to that round. */
  "chat:locateMessage": { messageId: string };
  /** Fired when a focus (explain-word) overlay closes — the exit-record entry
   * flow listens for this instead of the store reaching into it directly. */
  "focus:exited": { sessionId: string };
}

export type BreadcrumbEventName = keyof BreadcrumbEventMap;
