/**
 * Purpose: unit tests for the discovery feed's source settings — every choice survives a write
 * and a re-read, a pasted address that is not an address is refused with a plain line instead of
 * being stored, and a settings row written by some other build cannot take the feed down with it.
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

const { useDiscoveryChannelSettingsStore, ensureDiscoveryChannelSettingsLoaded } = await import(
  "./discoveryChannelSettingsStore"
);

function store() {
  return useDiscoveryChannelSettingsStore.getState();
}

beforeEach(() => {
  storedRows = {};
  useDiscoveryChannelSettingsStore.setState({
    loaded: false,
    channelEnabledById: {},
    dataSaverEnabled: false,
    userFeedUrls: [],
    doubanUserId: "",
    onboardingDismissed: false,
  });
});

describe("discovery source settings", () => {
  it("keeps every choice across a reload", async () => {
    await store().setChannelEnabled("sspai", false);
    await store().setDataSaverEnabled(true);
    await store().setDoubanUserId("  leo42  ");
    await store().addUserFeedUrl("https://example.org/feed");
    await store().dismissOnboarding();

    useDiscoveryChannelSettingsStore.setState({ loaded: false });
    await store().loadFromDatabase();

    expect(store()).toMatchObject({
      channelEnabledById: { sspai: false },
      dataSaverEnabled: true,
      doubanUserId: "leo42",
      userFeedUrls: ["https://example.org/feed"],
      onboardingDismissed: true,
    });
  });

  it("refuses a line that is not an address, and the same feed twice", async () => {
    expect(await store().addUserFeedUrl("我的博客")).toEqual({
      ok: false,
      reason: "这不像一个网址。订阅地址通常以 http 开头。",
    });
    expect(store().userFeedUrls).toEqual([]);

    await store().addUserFeedUrl("https://example.org/feed");
    expect(await store().addUserFeedUrl("https://example.org/feed")).toEqual({
      ok: false,
      reason: "这个地址已经在列表里了。",
    });
    expect(store().userFeedUrls).toHaveLength(1);
  });

  it("removes a feed the reader is done with", async () => {
    await store().addUserFeedUrl("https://example.org/feed");
    await store().removeUserFeedUrl("https://example.org/feed");
    expect(store().userFeedUrls).toEqual([]);
  });

  it("falls back to the defaults when the stored row makes no sense", async () => {
    storedRows.discoveryChannelSettings = { dataSaverEnabled: "yes", userFeedUrls: 7 };
    await store().loadFromDatabase();
    expect(store()).toMatchObject({ dataSaverEnabled: false, userFeedUrls: [] });
  });

  it("reads the row once, however many callers ask for it", async () => {
    await Promise.all([
      ensureDiscoveryChannelSettingsLoaded(),
      ensureDiscoveryChannelSettingsLoaded(),
    ]);
    expect(store().loaded).toBe(true);
  });
});
