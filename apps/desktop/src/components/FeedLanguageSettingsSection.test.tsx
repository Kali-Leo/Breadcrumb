// @vitest-environment jsdom
/**
 * Purpose: the language settings' say over the feed, mounted for real (spec 054) — what it says,
 * that it only offers the languages the reader has not already got, and that switching one on
 * reaches the stored set the filter reads.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const settings = {
  loaded: true,
  feedLanguage: "zh" as "zh" | "en" | null,
  additionalFeedLanguages: [] as ("zh" | "en")[],
};
const setAdditionalFeedLanguageEnabled = vi.fn(async () => undefined);
const loadFromDatabase = vi.fn(async () => undefined);
const reshapeUpcoming = vi.fn(async () => undefined);

type Selector<T> = (state: typeof settings) => T;

vi.mock("../stores/discoveryChannelSettingsStore", () => ({
  useDiscoveryChannelSettingsStore: Object.assign(
    <T,>(select: Selector<T>): T => select(settings),
    { getState: () => ({ ...settings, setAdditionalFeedLanguageEnabled, loadFromDatabase }) },
  ),
}));

vi.mock("../stores/discoveryStore", () => ({
  useDiscoveryStore: { getState: () => ({ reshapeUpcoming }) },
}));

const {
  FeedLanguageSettingsSection,
  FEED_LANGUAGE_SETTINGS_HINT,
  FEED_LANGUAGE_SETTINGS_TITLE,
  feedLanguageStatusLine,
} = await import("./FeedLanguageSettingsSection");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  settings.feedLanguage = "zh";
  settings.additionalFeedLanguages = [];
  setAdditionalFeedLanguageEnabled.mockClear();
  reshapeUpcoming.mockClear();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount(): void {
  act(() => root.render(<FeedLanguageSettingsSection />));
}

function switchFor(label: string): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>(
    `button[aria-label="发现页显示${label}"]`,
  );
  if (!found) throw new Error(`no switch for ${label}`);
  return found;
}

describe("what the section says", () => {
  it("names itself and explains in one sentence what switching a language on does", () => {
    mount();
    expect(container.querySelector("h3")?.textContent).toBe("发现页的语言");
    expect(FEED_LANGUAGE_SETTINGS_TITLE).toBe("发现页的语言");
    expect(FEED_LANGUAGE_SETTINGS_HINT).toBe(
      "打开一种语言，发现页里也会出现这种语言的文章、视频和播客。",
    );
    expect(container.querySelector("p")?.textContent).toBe(
      `发现页现在显示中文。${FEED_LANGUAGE_SETTINGS_HINT}`,
    );
    expect(feedLanguageStatusLine("en")).toBe("发现页现在显示English。");
  });

  it("offers only the languages the reader is not already reading", () => {
    mount();
    const labels = [...container.querySelectorAll("button")].map((button) =>
      button.getAttribute("aria-label"),
    );
    expect(labels).toEqual(["发现页显示English"]);
  });

  it("shows the switch already on when that language is already switched on", () => {
    settings.additionalFeedLanguages = ["en"];
    mount();
    expect(switchFor("English").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("what the section changes", () => {
  it("switches the language on and re-ranks what the reader has not reached yet", async () => {
    mount();
    await act(async () => {
      switchFor("English").click();
      await Promise.resolve();
    });
    expect(setAdditionalFeedLanguageEnabled).toHaveBeenCalledWith("en", true);
    expect(reshapeUpcoming).toHaveBeenCalledOnce();
  });

  it("switches it back off again", async () => {
    settings.additionalFeedLanguages = ["en"];
    mount();
    await act(async () => {
      switchFor("English").click();
      await Promise.resolve();
    });
    expect(setAdditionalFeedLanguageEnabled).toHaveBeenCalledWith("en", false);
  });
});
