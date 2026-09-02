/**
 * Purpose: unit tests for removing a downloaded language pack — the bundled pair is refused,
 * a pair not in use is deleted without touching the current choice, and the pair in use is
 * swapped for the bundled one BEFORE its pack is deleted; afterwards the installed list no
 * longer offers the removed pair as ready.
 */
import { describe, expect, it, vi } from "vitest";
import { type PackRemovalHandoffs, removePairWith } from "./languagePackRemoval";
import { BUNDLED_PAIR_ID } from "./languagePacks";

vi.mock("./languagePacks", () => ({ BUNDLED_PAIR_ID: "zh:en" }));

function fakeStorage(installed: string[], current: string) {
  const calls: string[] = [];
  let currentPair = current;
  let packs = new Set(installed);
  const handoffs: PackRemovalHandoffs = {
    currentPairId: () => currentPair,
    switchPair: async (pairId) => {
      calls.push(`switch:${pairId}`);
      currentPair = pairId;
    },
    removePack: async (pairId) => {
      calls.push(`remove:${pairId}`);
      packs.delete(pairId);
    },
    listInstalled: async () => [BUNDLED_PAIR_ID, ...packs].sort(),
    setInstalled: (pairs) => {
      calls.push(`installed:${pairs.join(",")}`);
      packs = new Set(pairs.filter((pair) => pair !== BUNDLED_PAIR_ID));
    },
  };
  return { handoffs, calls, currentPair: () => currentPair, installed: () => [...packs] };
}

describe("removePairWith", () => {
  it("never removes the bundled pair", async () => {
    const storage = fakeStorage(["zh:sw"], "zh:sw");
    const outcome = await removePairWith(storage.handoffs, BUNDLED_PAIR_ID);
    expect(outcome).toEqual({ removed: false, switchedToBundled: false });
    expect(storage.calls).toEqual([]);
  });

  it("removes a pair not in use and leaves the current choice alone", async () => {
    const storage = fakeStorage(["zh:sw", "zh:fr"], "zh:fr");
    const outcome = await removePairWith(storage.handoffs, "zh:sw");
    expect(outcome).toEqual({ removed: true, switchedToBundled: false });
    expect(storage.currentPair()).toBe("zh:fr");
    expect(storage.installed()).toEqual(["zh:fr"]);
    expect(storage.calls).toEqual(["remove:zh:sw", "installed:zh:en,zh:fr"]);
  });

  it("switches the pair in use back to the bundled one before deleting its pack", async () => {
    const storage = fakeStorage(["zh:sw"], "zh:sw");
    const outcome = await removePairWith(storage.handoffs, "zh:sw");
    expect(outcome).toEqual({ removed: true, switchedToBundled: true });
    expect(storage.currentPair()).toBe(BUNDLED_PAIR_ID);
    expect(storage.calls).toEqual(["switch:zh:en", "remove:zh:sw", "installed:zh:en"]);
    // Back to the download-offered state: only the bundled pair is ready.
    expect(await storage.handoffs.listInstalled()).toEqual([BUNDLED_PAIR_ID]);
  });
});
