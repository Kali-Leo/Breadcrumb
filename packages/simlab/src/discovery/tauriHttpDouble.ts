/**
 * Purpose: the module test files hand to `vi.mock` for `@tauri-apps/plugin-http`. It exports a
 * `fetch` with the same shape the desktop app imports, forwarding to whichever FakeChannelNetwork
 * the current test installed — the indirection exists because `vi.mock` factories run before any
 * test body, so the network they answer from has to be swappable afterwards.
 * Main exports: installFakeNetwork, fakeNetwork, fetch.
 */
import type { FakeChannelNetwork } from "./fakeChannelNetwork";

let installed: FakeChannelNetwork | null = null;

export function installFakeNetwork(network: FakeChannelNetwork): FakeChannelNetwork {
  installed = network;
  return network;
}

export function fakeNetwork(): FakeChannelNetwork {
  if (installed === null) {
    throw new Error("simlab discovery harness: installFakeNetwork() was never called");
  }
  return installed;
}

export function fetch(url: string, init?: RequestInit): Promise<Response> {
  return fakeNetwork().fetch(url, init);
}
