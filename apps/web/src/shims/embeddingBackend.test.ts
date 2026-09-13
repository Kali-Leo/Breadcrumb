/**
 * Purpose: which of the three ways to run the model this browser is offered, and in what
 * order. The tier that matters most is the middle one — several WebAssembly threads — because
 * it is available only on a cross-origin-isolated page, which is the entire reason the service
 * worker adds two response headers it would otherwise have no business adding.
 */
import { describe, expect, it } from "vitest";
import {
  availableTiers,
  BACKEND_TIERS,
  gpuIsUsable,
  isCrossOriginIsolated,
} from "./embedding/backend";

const isolated = { crossOriginIsolated: true };
const plain = { crossOriginIsolated: false };

describe("BACKEND_TIERS", () => {
  it("is ordered best first and ends somewhere that always works", () => {
    expect(BACKEND_TIERS.map((tier) => tier.id)).toEqual(["webgpu", "wasm-threads", "wasm-single"]);
    expect(BACKEND_TIERS.at(-1)).toMatchObject({ device: "wasm", threads: 1 });
  });

  it("fetches one graph for every tier, so no tier costs a second download", () => {
    expect(new Set(BACKEND_TIERS.map((tier) => tier.dtype))).toEqual(new Set(["int8"]));
  });
});

describe("availableTiers", () => {
  it("offers the graphics card only where one actually answered", () => {
    const withGpu = availableTiers({ hardwareConcurrency: 8 }, isolated, true);
    expect(withGpu[0]?.id).toBe("webgpu");
    // A `navigator.gpu` that exists and cannot produce an adapter is the common case in a
    // virtual machine; attempting it there broke the two WebAssembly tiers behind it.
    const withoutGpu = availableTiers({ hardwareConcurrency: 8 }, isolated, false);
    expect(withoutGpu.map((tier) => tier.id)).not.toContain("webgpu");
  });

  it("never offers the card without being asked, so the default cannot be the risky one", () => {
    expect(availableTiers({ hardwareConcurrency: 8 }, isolated)[0]?.id).toBe("wasm-threads");
  });

  it("drops the multi-thread tier on a page that is not cross-origin isolated", () => {
    // Without the service worker's two headers there is no SharedArrayBuffer, and without
    // SharedArrayBuffer there are no WebAssembly threads. Attempting it anyway would cost a
    // model download before it failed.
    const tiers = availableTiers({ hardwareConcurrency: 8 }, plain);
    expect(tiers.map((tier) => tier.id)).toEqual(["wasm-single"]);
  });

  it("drops it on a single-core machine too, isolated or not", () => {
    const tiers = availableTiers({ hardwareConcurrency: 1 }, isolated);
    expect(tiers.map((tier) => tier.id)).toEqual(["wasm-single"]);
  });

  it("never asks for more threads than the machine has cores", () => {
    const two = availableTiers({ hardwareConcurrency: 2 }, isolated);
    expect(two.find((tier) => tier.id === "wasm-threads")?.threads).toBe(2);
    const many = availableTiers({ hardwareConcurrency: 32 }, isolated);
    expect(many.find((tier) => tier.id === "wasm-threads")?.threads).toBe(4);
  });

  it("still has somewhere to run when it knows nothing about the browser", () => {
    expect(availableTiers(undefined, {}).map((tier) => tier.id)).toEqual(["wasm-single"]);
  });

  it("does not hand out the shared tier objects for a caller to mutate", () => {
    const tiers = availableTiers({ hardwareConcurrency: 8 }, isolated);
    expect(tiers.every((tier) => !BACKEND_TIERS.includes(tier))).toBe(true);
  });
});

describe("gpuIsUsable", () => {
  it("is false where there is no graphics API at all", async () => {
    expect(await gpuIsUsable(undefined)).toBe(false);
    expect(await gpuIsUsable({})).toBe(false);
  });

  it("asks for an adapter rather than trusting the API's presence", async () => {
    expect(await gpuIsUsable({ gpu: { requestAdapter: async () => null } })).toBe(false);
    expect(await gpuIsUsable({ gpu: { requestAdapter: async () => ({}) } })).toBe(true);
  });

  it("treats a throwing adapter request as no card", async () => {
    const gpu = {
      requestAdapter: async () => {
        throw new Error("no driver");
      },
    };
    expect(await gpuIsUsable({ gpu })).toBe(false);
  });
});

describe("isCrossOriginIsolated", () => {
  it("trusts the browser's own answer and nothing else", () => {
    expect(isCrossOriginIsolated({ crossOriginIsolated: true })).toBe(true);
    expect(isCrossOriginIsolated({ crossOriginIsolated: false })).toBe(false);
    expect(isCrossOriginIsolated({})).toBe(false);
  });
});
