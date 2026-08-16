/**
 * Purpose: shared helpers for stores that keep per-conversation layered state
 * (Map<conversationId, Layer>) filled on first visit and never wiped on switch — layers
 * accumulate for every conversation visited this app session (the Discord/Slack cached
 * view-state tradeoff: memory for instant switch-back).
 * Main exports: setConversationLayer, createSingleFlightLoader.
 */

/** Copy-on-write layer write — returns a new outer Map so zustand subscribers re-render. */
export function setConversationLayer<Layer>(
  layers: ReadonlyMap<string, Layer>,
  conversationId: string,
  layer: Layer,
): Map<string, Layer> {
  return new Map(layers).set(conversationId, layer);
}

/** One in-flight load per conversation (doorStore's reservation idea, promise-map form like
 * chatStore's sessionLoads): concurrent callers share the same promise; once settled, the
 * slot frees so a later forced reload can run. */
export function createSingleFlightLoader(): (
  conversationId: string,
  load: () => Promise<void>,
) => Promise<void> {
  const inFlightByConversation = new Map<string, Promise<void>>();
  return (conversationId, load) => {
    const inFlight = inFlightByConversation.get(conversationId);
    if (inFlight !== undefined) return inFlight;
    const running = load().finally(() => inFlightByConversation.delete(conversationId));
    inFlightByConversation.set(conversationId, running);
    return running;
  };
}
