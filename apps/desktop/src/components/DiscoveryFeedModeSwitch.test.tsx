// @vitest-environment jsdom
/**
 * Purpose: the feed header's two mode controls, mounted for real (spec 054, Leo's seventh and
 * eighth points) — that both states are named on the pill, that moving it stores the choice and
 * redraws the feed rather than re-ranking below the fold, and that the 学术内容 switch is on the
 * page only while 专业 is chosen, which is where Leo said to put it.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const settings = {
  feedMode: "casual" as "casual" | "professional",
  academicContentEnabled: true,
};
const setFeedMode = vi.fn(async () => undefined);
const setAcademicContentEnabled = vi.fn(async () => undefined);
const redrawFeed = vi.fn(async () => undefined);

type Selector<T> = (state: typeof settings) => T;

vi.mock("../stores/discoveryChannelSettingsStore", () => ({
  useDiscoveryChannelSettingsStore: Object.assign(
    <T,>(select: Selector<T>): T => select(settings),
    { getState: () => ({ ...settings, setFeedMode, setAcademicContentEnabled }) },
  ),
}));

vi.mock("../stores/discoveryStore", () => ({
  useDiscoveryStore: { getState: () => ({ redrawFeed }) },
}));

const { DiscoveryFeedModeSwitch } = await import("./DiscoveryFeedModeSwitch");
const { ACADEMIC_CONTENT_HINT, ACADEMIC_CONTENT_LABEL, DiscoveryAcademicContentSwitch } =
  await import("./DiscoveryAcademicContentSwitch");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  settings.feedMode = "casual";
  settings.academicContentEnabled = true;
  setFeedMode.mockClear();
  setAcademicContentEnabled.mockClear();
  redrawFeed.mockClear();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mountHeader(): void {
  act(() =>
    root.render(
      <>
        <DiscoveryFeedModeSwitch />
        <DiscoveryAcademicContentSwitch />
      </>,
    ),
  );
}

function segment(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === label,
  );
  if (!found) throw new Error(`no segment named ${label}`);
  return found;
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
}

describe("the 休闲｜专业 pill", () => {
  it("names both states and marks the chosen one", () => {
    mountHeader();
    expect(segment("休闲").getAttribute("aria-pressed")).toBe("true");
    expect(segment("专业").getAttribute("aria-pressed")).toBe("false");
  });

  it("stores the new mode and redraws the feed", async () => {
    mountHeader();
    await click(segment("专业"));
    expect(setFeedMode).toHaveBeenCalledWith("professional");
    expect(redrawFeed).toHaveBeenCalledOnce();
  });

  it("does nothing at all when the reader taps the mode they are already in", async () => {
    mountHeader();
    await click(segment("休闲"));
    expect(setFeedMode).not.toHaveBeenCalled();
    expect(redrawFeed).not.toHaveBeenCalled();
  });
});

describe("the 学术内容 switch", () => {
  it("stays off the page while the reader is 休闲, where it would decide nothing", () => {
    mountHeader();
    expect(container.textContent).not.toContain(ACADEMIC_CONTENT_LABEL);
  });

  it("appears next to the pill once 专业 is chosen, and says in one sentence what it does", () => {
    settings.feedMode = "professional";
    mountHeader();
    expect(container.textContent).toContain(ACADEMIC_CONTENT_LABEL);
    expect(ACADEMIC_CONTENT_HINT).toBe("打开时，发现页里会有论文。");
    expect(container.querySelector(`[title="${ACADEMIC_CONTENT_HINT}"]`)).not.toBeNull();
  });

  it("reads as a switch to a screen reader, and starts on", () => {
    settings.feedMode = "professional";
    mountHeader();
    const toggle = container.querySelector('button[role="switch"]');
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
    expect(toggle?.getAttribute("aria-label")).toBe(ACADEMIC_CONTENT_LABEL);
  });

  it("switches papers off and redraws the feed", async () => {
    settings.feedMode = "professional";
    mountHeader();
    const toggle = container.querySelector<HTMLButtonElement>('button[role="switch"]');
    if (!toggle) throw new Error("no 学术内容 switch");
    await click(toggle);
    expect(setAcademicContentEnabled).toHaveBeenCalledWith(false);
    expect(redrawFeed).toHaveBeenCalledOnce();
  });
});
