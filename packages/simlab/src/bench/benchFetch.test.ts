/**
 * Purpose: the probe has one job — time every request and count how many there were, without
 * changing what is sent. Both halves are checked here, including the failure path, because a
 * call that died on the wire is exactly the one whose latency nobody would otherwise see.
 */
import { describe, expect, it } from "vitest";
import { createBenchFetch } from "./benchFetch";

function fakeResponse(status: number): Response {
  return new Response("{}", { status });
}

describe("createBenchFetch", () => {
  it("records one entry per request with its status and elapsed time", async () => {
    let clock = 0;
    const probe = createBenchFetch({
      baseFetch: async () => {
        clock += 250;
        return fakeResponse(200);
      },
      now: () => clock,
    });
    await probe.fetchImpl("https://example.test/v1/chat/completions");
    await probe.fetchImpl("https://example.test/v1/chat/completions");
    expect(probe.records()).toEqual([
      { latencyMs: 250, status: 200 },
      { latencyMs: 250, status: 200 },
    ]);
  });

  it("passes the request through untouched", async () => {
    let seen: string | undefined;
    const probe = createBenchFetch({
      baseFetch: async (_input, init) => {
        seen = typeof init?.body === "string" ? init.body : undefined;
        return fakeResponse(200);
      },
    });
    const body = JSON.stringify({ model: "m", messages: [] });
    await probe.fetchImpl("https://example.test/v1/chat/completions", { method: "POST", body });
    expect(seen).toBe(body);
  });

  it("records a request that never got a status, and rethrows", async () => {
    let clock = 0;
    const probe = createBenchFetch({
      baseFetch: async () => {
        clock += 90;
        throw new Error("socket hang up");
      },
      now: () => clock,
    });
    await expect(probe.fetchImpl("https://example.test/")).rejects.toThrow("socket hang up");
    expect(probe.records()).toEqual([{ latencyMs: 90, status: 0 }]);
  });
});
