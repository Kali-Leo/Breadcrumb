/**
 * Purpose: per-conversation stop-generation registry (spec: ChatGPT-style stop button) —
 * every chat round registers an AbortController under its own conversation id, so a stop
 * always targets an explicit conversation, never "whatever is active at event time".
 * Main exports: beginStreamControl, endStreamControl, abortStreamControl, isAbortError.
 * Side effect: holds the module-level controller registry.
 */

const controllersByConversation = new Map<string, AbortController>();

/** Registers a fresh controller for this conversation's in-flight round, or null when one is
 * already registered — the caller must then not start a round at all.
 *
 * Null rather than an overwrite: overwriting dropped the RUNNING round's controller on the
 * floor, so its stop button (and a delete, and a shutdown) aborted the newcomer instead and
 * the original stream ran to completion, unstoppable, still spending money. A conversation
 * runs at most one round at a time; this is where that invariant is actually enforced. */
export function beginStreamControl(conversationId: string): AbortController | null {
  if (controllersByConversation.has(conversationId)) return null;
  const controller = new AbortController();
  controllersByConversation.set(conversationId, controller);
  return controller;
}

/** Unregisters a finished round's controller — only if it is still the registered one, so
 * a slow round ending late never removes a newer round's controller. */
export function endStreamControl(conversationId: string, controller: AbortController): void {
  if (controllersByConversation.get(conversationId) === controller) {
    controllersByConversation.delete(conversationId);
  }
}

/** Aborts the given conversation's in-flight round, if any. */
export function abortStreamControl(conversationId: string): void {
  controllersByConversation.get(conversationId)?.abort();
}

/** Recognizes the normalized abort rejection chatStream throws on a stopped round. */
export function isAbortError(error: unknown): boolean {
  return (error instanceof DOMException || error instanceof Error) && error.name === "AbortError";
}
