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
  "chat:responseFinished": { conversationId: string; messageId: string; finishedAt: string };
  "factcheck:finished": { conversationId: string; messageId: string; runId: string };
}

export type BreadcrumbEventName = keyof BreadcrumbEventMap;
