/**
 * Purpose: minimal typed publish/subscribe event bus used by the app shell and all plugins.
 * Main exports: createEventBus(), EventBus. No side effects; instances are created explicitly.
 */
import type { BreadcrumbEventMap, BreadcrumbEventName } from "@breadcrumb/sdk";

export type EventHandler<Name extends BreadcrumbEventName> = (
  payload: BreadcrumbEventMap[Name],
) => void;

export interface EventBus {
  on<Name extends BreadcrumbEventName>(eventName: Name, handler: EventHandler<Name>): () => void;
  emit<Name extends BreadcrumbEventName>(eventName: Name, payload: BreadcrumbEventMap[Name]): void;
}

export function createEventBus(): EventBus {
  const handlersByEvent = new Map<BreadcrumbEventName, Set<EventHandler<BreadcrumbEventName>>>();

  return {
    on(eventName, handler) {
      const handlers = handlersByEvent.get(eventName) ?? new Set();
      handlers.add(handler as EventHandler<BreadcrumbEventName>);
      handlersByEvent.set(eventName, handlers);
      return () => {
        handlers.delete(handler as EventHandler<BreadcrumbEventName>);
      };
    },
    emit(eventName, payload) {
      const handlers = handlersByEvent.get(eventName);
      if (!handlers) return;
      for (const handler of handlers) {
        try {
          handler(payload);
        } catch (error) {
          // One misbehaving subscriber must never block delivery to the rest, nor unwind
          // into the feature that emitted the event.
          console.warn(`[core-bus] handler for "${eventName}" threw`, error);
        }
      }
    },
  };
}
