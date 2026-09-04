/**
 * Purpose: unit tests for the weave epoch — the signal that a weave-affecting settings change
 * fires. It exists twice over, and both halves were broken: the cached patches are swept, but
 * nothing told the screen to ask for a weave again, and a weave already in flight threw its
 * result away and never ran a second time. Either one leaves every assistant message on
 * screen permanently blank, because the render gate blanks text until patches land
 * (2026-09-04). Only the world around the weave is mocked; the loop itself is the code under
 * test.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";
import { bumpWeaveEpoch, weaveAndStore } from "./diglotWeaveRun";

interface FakeDiglotState {
  settings: { enabled: boolean; density: number; newWordDailyBase: number };
  loaded: unknown;
  cardsByLemma: Map<string, unknown>;
  patchesByMessage: Map<string, { text: string }[]>;
  newWordsIntroducedToday: number;
  weaveEpoch: number;
}

const store = createStore<FakeDiglotState>(() => ({
  settings: { enabled: true, density: 0.02, newWordDailyBase: 5 },
  loaded: { pack: { id: "zh:en" } },
  cardsByLemma: new Map(),
  patchesByMessage: new Map(),
  newWordsIntroducedToday: 0,
  weaveEpoch: 0,
}));

// Arrow bodies on purpose: the factory is hoisted above `store`, so it may only close over
// it, never read it.
vi.mock("../../stores/diglotStore", () => ({
  useDiglotStore: {
    getState: () => store.getState(),
    setState: (partial: Partial<FakeDiglotState>) => store.setState(partial),
  },
}));
vi.mock("../../stores/settingsStore", () => ({
  useSettingsStore: { getState: () => ({ apiConfig: null, networkEnabled: false }) },
}));
vi.mock("../platform/db", () => ({ getRepos: vi.fn(async () => ({})) }));
vi.mock("./diglotPlacement", () => ({ nextPlacementState: vi.fn(async () => null) }));
vi.mock("./diglotRefine", () => ({ refineWeavePatches: vi.fn() }));
vi.mock("./diglotReveal", () => ({
  REFINE_HARD_TIMEOUT_MS: 1,
  refineWithHardTimeout: vi.fn(),
}));

/** Hands each weave a promise the test resolves by hand, so a settings change can land
 * exactly while one is in flight. */
const pending: ((patches: { text: string }[]) => void)[] = [];
const weaveAssistantMessage = vi.fn(
  () =>
    new Promise((resolve) => {
      pending.push((patches) => resolve({ patches, introducedLemmas: [] }));
    }),
);
vi.mock("./diglotWeave", () => ({ weaveAssistantMessage: () => weaveAssistantMessage() }));

/** Lets the awaits between one resolve and the next weave call run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  pending.length = 0;
  weaveAssistantMessage.mockClear();
  store.setState({
    patchesByMessage: new Map(),
    newWordsIntroducedToday: 0,
    weaveEpoch: 0,
  });
});

describe("the weave epoch", () => {
  it("moves when a weave-affecting setting changes, so the screen asks again", () => {
    const before = store.getState().weaveEpoch;
    bumpWeaveEpoch();
    expect(store.getState().weaveEpoch).toBe(before + 1);
  });

  it("stores what one weave produced", async () => {
    const done = weaveAndStore("m1", "hello", false);
    await settle();
    pending[0]?.([{ text: "one" }]);
    await done;
    expect(store.getState().patchesByMessage.get("m1")).toEqual([{ text: "one" }]);
  });

  it("weaves again, rather than blanking the message, when settings change mid-weave", async () => {
    const done = weaveAndStore("m2", "hello", false);
    await settle();
    // What saveSettings does when density changes: sweep the cache, move the epoch.
    bumpWeaveEpoch();
    store.setState({ patchesByMessage: new Map() });
    pending[0]?.([{ text: "stale" }]);
    await settle();
    expect(weaveAssistantMessage).toHaveBeenCalledTimes(2);
    pending[1]?.([{ text: "fresh" }]);
    await done;
    expect(store.getState().patchesByMessage.get("m2")).toEqual([{ text: "fresh" }]);
  });

  it("weaves a message swept out of the cache again when asked again", async () => {
    const first = weaveAndStore("m3", "hello", false);
    await settle();
    pending[0]?.([{ text: "one" }]);
    await first;
    // Asking again while the patches are cached is free — nothing re-weaves.
    await weaveAndStore("m3", "hello", false);
    expect(weaveAssistantMessage).toHaveBeenCalledTimes(1);
    // After the sweep the same ask has to reach a weave, or the gate never opens.
    bumpWeaveEpoch();
    store.setState({ patchesByMessage: new Map() });
    const second = weaveAndStore("m3", "hello", false);
    await settle();
    pending[1]?.([{ text: "two" }]);
    await second;
    expect(store.getState().patchesByMessage.get("m3")).toEqual([{ text: "two" }]);
  });

  it("does not weave at all while language learning is off", async () => {
    store.setState({ settings: { enabled: false, density: 0.02, newWordDailyBase: 5 } });
    await weaveAndStore("m4", "hello", false);
    expect(weaveAssistantMessage).not.toHaveBeenCalled();
    store.setState({ settings: { enabled: true, density: 0.02, newWordDailyBase: 5 } });
  });
});
