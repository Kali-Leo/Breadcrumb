/**
 * Purpose: the typed event map the application bus (core-bus) is generic over. Breadcrumb
 * has no runtime plugin system — "plugin-*" packages are feature modules compiled in like
 * any other code (ADR-0035); the manifest/permission types that once suggested otherwise
 * were deleted with that ruling.
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
    /** Anchored node captured at send time — extraction stamps sighting provenance with it
     * (spec 040 §7); reading the store minutes later races against anchor changes. */
    anchoredNodeId: string | null;
  };
  "factcheck:finished": { conversationId: string; messageId: string; runId: string };
  /** Fired after knowledge-tree extraction lands new nodes (and their embeddings); the
   * edge pipeline (spec 010) keys off this instead of racing a fixed timer.
   * touchedNodeIds = every node sighted this round (new or re-sighted); freshNodeIds is
   * the new-only subset kept for backward-compatible highlighting. */
  "knowledge:nodesExtracted": {
    conversationId: string;
    freshNodeIds: string[];
    touchedNodeIds: string[];
    /** The assistant reply this round's nodes were extracted from — provenance the edge
     * pipeline stores on every edge it records (migration 0048). */
    sourceMessageId: string;
  };
  /** Ask the shell to switch to the chat view with a conversation open — used by the
   * comparison tree's practice discussions (spec 026). */
  "app:navigateChat": { conversationId: string };
  /** Ask the palace to open its goal view — emitted by the sidebar's goal card, which
   * lives outside the palace component tree (spec 050 §5). */
  "palace:openGoalView": Record<string, never>;
  /** Open a companion/helper conversation in the floating chat popup instead of the main
   * chat view (spec 050 §8). */
  "companion:openPopup": { conversationId: string; title: string };
  /** Fired after new knowledge_edges rows land (spec 010); spec 012's experiment panel
   * refreshes on this instead of polling. */
  "knowledge:edgesUpdated": { addedEdgeIds: string[] };
  /** Fired after interest_signals rows land for a round (spec 011). */
  "interest:updated": { nodeIds: string[] };
  /** Fired after mastery_claims rows land, e.g. from the self-report action (spec 011). */
  "mastery:updated": { changedNodeIds: string[] };
  /** Prefills one composer's draft without sending (spec 039 precedent; the user still
   * presses send themselves). conversationId addresses the composer bound to that
   * conversation — null addresses the new-conversation composer; without it, every mounted
   * composer (main view + popup) would apply the same prefill. */
  "composer:prefill": { text: string; conversationId: string | null };
  /** Station map click -> scroll chat to that round (spec 040 §3). */
  "chat:locateMessage": { messageId: string };
  /** Fired when a focus (explain-word) overlay closes (spec 042 §3) — the exit-record entry
   * flow (spec 042 §5) listens for this instead of the store reaching into it directly. */
  "focus:exited": { sessionId: string };
}

export type BreadcrumbEventName = keyof BreadcrumbEventMap;
