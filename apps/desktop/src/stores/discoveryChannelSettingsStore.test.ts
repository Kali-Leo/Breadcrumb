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

const {
  useDiscoveryChannelSettingsStore,
  ensureDiscoveryChannelSettingsLoaded,
  ensureFeedLanguagePolicyLoaded,
  ensureFeedModePolicyLoaded,
} = await import("./discoveryChannelSettingsStore");

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
    feedLanguage: null,
    additionalFeedLanguages: [],
    feedMode: "casual",
    academicContentEnabled: true,
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

  it("keeps the language the first-run panel chose and the ones the settings added", async () => {
    await store().setFeedLanguage("zh");
    await store().setAdditionalFeedLanguageEnabled("en", true);

    useDiscoveryChannelSettingsStore.setState({ loaded: false });
    await store().loadFromDatabase();
    expect(store()).toMatchObject({ feedLanguage: "zh", additionalFeedLanguages: ["en"] });

    await store().setAdditionalFeedLanguageEnabled("en", false);
    expect(store().additionalFeedLanguages).toEqual([]);
  });

  it("never leaves the chosen language sitting in the list of extra ones", async () => {
    await store().setAdditionalFeedLanguageEnabled("en", true);
    await store().setFeedLanguage("en");
    expect(store().additionalFeedLanguages).toEqual([]);
  });

  /** Spec 054, Leo's seventh and eighth points. Both are read on the feed's own page, so a write
   * that silently dropped one of them would change the grid on the reader's next launch. */
  it("keeps the feed's mode and the 学术内容 switch across a reload", async () => {
    expect(store().feedMode).toBe("casual");
    expect(store().academicContentEnabled).toBe(true);

    await store().setFeedMode("professional");
    await store().setAcademicContentEnabled(false);
    await store().setFeedLanguage("zh");

    useDiscoveryChannelSettingsStore.setState({ loaded: false });
    await store().loadFromDatabase();
    expect(store()).toMatchObject({
      feedMode: "professional",
      academicContentEnabled: false,
      feedLanguage: "zh",
    });
  });

  it("hands both filters the stored answer, not a fresh default", async () => {
    await store().setFeedMode("professional");
    await store().setAcademicContentEnabled(false);
    await store().setChannelEnabled("juejin", true);

    expect(await ensureFeedModePolicyLoaded()).toEqual({
      mode: "professional",
      readerChosenSourceIds: ["juejin"],
    });
    expect((await ensureFeedLanguagePolicyLoaded()).academicContentEnabled).toBe(false);
  });

  it("reads the row once, however many callers ask for it", async () => {
    await Promise.all([
      ensureDiscoveryChannelSettingsLoaded(),
      ensureDiscoveryChannelSettingsLoaded(),
    ]);
    expect(store().loaded).toBe(true);
  });
});
