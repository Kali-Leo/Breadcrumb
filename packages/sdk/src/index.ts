/**
 * Purpose: public contracts every Breadcrumb plugin builds against.
 * Main exports: BreadcrumbEventMap (typed event bus contract), PluginManifest, PluginPermission.
 */

/** Permissions a plugin may request in its manifest; user confirms on install. */
export type PluginPermission =
  | "storage:read"
  | "storage:write"
  | "llm:invoke"
  | "network:fetch"
  | "ui:sidebar"
  | "ui:panel";

/** Metadata every plugin ships as `mod.json`. Runtime validation lives in core-bus. */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  main: string;
  permissions: PluginPermission[];
  description?: string;
}

/**
 * Global event map: event name -> payload shape.
 * Grows as features land; plugins subscribe via the typed bus, never by string guessing.
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
  };
  /** Ask the shell to switch to the chat view with a conversation open — used by the
   * comparison tree's practice discussions (spec 026). */
  "app:navigateChat": { conversationId: string };
  /** Ask the palace to open its goal view — emitted by the sidebar's goal card, which
   * lives outside the palace component tree (spec 050 §5). */
  "palace:openGoalView": Record<string, never>;
  /** Fired after new knowledge_edges rows land (spec 010); spec 012's experiment panel
   * refreshes on this instead of polling. */
  "knowledge:edgesUpdated": { addedEdgeIds: string[] };
  /** Fired after interest_signals rows land for a round (spec 011). */
  "interest:updated": { nodeIds: string[] };
  /** Fired after mastery_claims rows land, e.g. from the self-report action (spec 011). */
  "mastery:updated": { changedNodeIds: string[] };
  /** Prefills the composer's draft without sending — used by the explore door "展开聊聊"
   * action and the assistant-message selection quote bar (spec 039); the user still presses
   * send themselves. */
  "composer:prefill": { text: string };
  /** Station map click -> scroll chat to that round (spec 040 §3). */
  "chat:locateMessage": { messageId: string };
  /** Fired when a focus (explain-word) overlay closes (spec 042 §3) — the exit-record entry
   * flow (spec 042 §5) listens for this instead of the store reaching into it directly. */
  "focus:exited": { sessionId: string };
}

export type BreadcrumbEventName = keyof BreadcrumbEventMap;
