/**
 * Purpose: behavior tests for the typed event bus (subscribe, emit, unsubscribe).
 */
import { describe, expect, it } from "vitest";
import { createEventBus } from "./index";

describe("createEventBus", () => {
  it("delivers payloads to subscribed handlers", () => {
    const bus = createEventBus();
    const received: string[] = [];
    bus.on("app:launched", (payload) => received.push(payload.launchedAt));

    bus.emit("app:launched", { launchedAt: "2026-07-28T10:00:00Z" });

    expect(received).toEqual(["2026-07-28T10:00:00Z"]);
  });

  it("stops delivering after unsubscribe", () => {
    const bus = createEventBus();
    const received: string[] = [];
    const unsubscribe = bus.on("app:launched", (payload) => received.push(payload.launchedAt));

    unsubscribe();
    bus.emit("app:launched", { launchedAt: "2026-07-28T10:00:00Z" });

    expect(received).toEqual([]);
  });

  it("does not throw when emitting an event nobody subscribed to", () => {
    const bus = createEventBus();
    expect(() =>
      bus.emit("chat:messageSent", {
        conversationId: "c1",
        messageId: "m1",
        sentAt: "2026-07-28T10:00:00Z",
      }),
    ).not.toThrow();
  });
});
