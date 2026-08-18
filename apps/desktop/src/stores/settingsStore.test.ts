// @vitest-environment jsdom
/**
 * Purpose: the settings that have to survive closing the app. The card size (spec 054 §(b)) is one
 * of them: a reader who sets the feed to 小 and comes back tomorrow should not find it back at 中.
 * A stored value written by some other build must not leave the feed with no grid at all.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let storedRows: Record<string, unknown> = {};

vi.mock("../lib/db", () => ({
  getRepos: vi.fn(async () => ({
    settings: {
      get: async (key: string) => storedRows[key] ?? null,
      set: async (key: string, value: unknown) => {
        storedRows[key] = value;
      },
    },
  })),
}));

const { useSettingsStore } = await import("./settingsStore");

function store() {
  return useSettingsStore.getState();
}

beforeEach(() => {
  storedRows = {};
  useSettingsStore.setState({ loaded: false, discoveryCardSize: "medium" });
});

describe("the discovery feed's card size", () => {
  it("starts at the middle step", async () => {
    await store().loadFromDatabase();
    expect(store().discoveryCardSize).toBe("medium");
  });

  it("keeps the step the reader picked across a restart", async () => {
    await store().setDiscoveryCardSize("small");
    expect(store().discoveryCardSize).toBe("small");

    useSettingsStore.setState({ loaded: false, discoveryCardSize: "medium" });
    await store().loadFromDatabase();
    expect(store().discoveryCardSize).toBe("small");
  });

  it("keeps the largest step too", async () => {
    await store().setDiscoveryCardSize("large");
    useSettingsStore.setState({ loaded: false, discoveryCardSize: "medium" });
    await store().loadFromDatabase();
    expect(store().discoveryCardSize).toBe("large");
  });

  it("falls back to the middle step when the stored row makes no sense", async () => {
    storedRows.discoveryCardSize = "enormous";
    await store().loadFromDatabase();
    expect(store().discoveryCardSize).toBe("medium");
  });
});
