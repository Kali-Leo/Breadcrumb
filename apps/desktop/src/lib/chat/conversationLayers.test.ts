/**
 * Purpose: unit tests for the per-conversation layered-state helpers — copy-on-write layer
 * writes and the single-flight loader that backs every fill-on-first-visit store.
 */
import { describe, expect, it, vi } from "vitest";
import { createSingleFlightLoader, setConversationLayer } from "./conversationLayers";

describe("setConversationLayer", () => {
  it("returns a new map with the layer set, leaving the original untouched", () => {
    const original = new Map([["c1", [1]]]);
    const next = setConversationLayer(original, "c2", [2]);
    expect(next).not.toBe(original);
    expect(next.get("c1")).toEqual([1]);
    expect(next.get("c2")).toEqual([2]);
    expect(original.has("c2")).toBe(false);
  });

  it("overwrites an existing conversation's layer", () => {
    const next = setConversationLayer(new Map([["c1", [1]]]), "c1", [9]);
    expect(next.get("c1")).toEqual([9]);
  });
});

describe("createSingleFlightLoader", () => {
  it("shares one in-flight load between concurrent callers of the same conversation", async () => {
    const singleFlight = createSingleFlightLoader();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const load = vi.fn(() => gate);
    const first = singleFlight("c1", load);
    const second = singleFlight("c1", load);
    expect(second).toBe(first);
    release();
    await Promise.all([first, second]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("runs loads for different conversations independently", async () => {
    const singleFlight = createSingleFlightLoader();
    const load = vi.fn(async () => {});
    await Promise.all([singleFlight("c1", load), singleFlight("c2", load)]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("frees the slot once settled so a later forced reload can run", async () => {
    const singleFlight = createSingleFlightLoader();
    const load = vi.fn(async () => {});
    await singleFlight("c1", load);
    await singleFlight("c1", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("frees the slot after a rejection too", async () => {
    const singleFlight = createSingleFlightLoader();
    const failing = vi.fn(async () => {
      throw new Error("db locked");
    });
    await expect(singleFlight("c1", failing)).rejects.toThrow("db locked");
    const succeeding = vi.fn(async () => {});
    await singleFlight("c1", succeeding);
    expect(succeeding).toHaveBeenCalledTimes(1);
  });
});
