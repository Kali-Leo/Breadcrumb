// @vitest-environment jsdom
/**
 * Purpose: the card-size switch on the 发现 settings page (spec 054 §(b)). Three segments, all of
 * them named, exactly one marked as the current one — the two-segment pill's shape with one more
 * step (spec 052's ruling). What is checked here is that a reader can tell which step they are on
 * without clicking anything, and that clicking a step writes it.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscoveryCardSize } from "../lib/discoveryFeedGrid";

let cardSize: DiscoveryCardSize = "medium";
const setDiscoveryCardSize = vi.fn(async (size: DiscoveryCardSize) => {
  cardSize = size;
});

vi.mock("../stores/settingsStore", () => ({
  useSettingsStore: Object.assign(
    <Slice,>(select: (state: { discoveryCardSize: DiscoveryCardSize }) => Slice) =>
      select({ discoveryCardSize: cardSize }),
    { getState: () => ({ setDiscoveryCardSize }) },
  ),
}));

const { DiscoveryCardSizeSwitch } = await import("./DiscoveryCardSizeSwitch");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  cardSize = "medium";
  setDiscoveryCardSize.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function segments(): HTMLButtonElement[] {
  return [...container.querySelectorAll("button")];
}

describe("DiscoveryCardSizeSwitch", () => {
  it("names all three steps", () => {
    act(() => root.render(<DiscoveryCardSizeSwitch />));
    expect(segments().map((button) => button.textContent)).toEqual(["小", "中", "大"]);
  });

  it("marks the step in use and only that one", () => {
    act(() => root.render(<DiscoveryCardSizeSwitch />));
    expect(segments().map((button) => button.getAttribute("aria-pressed"))).toEqual([
      "false",
      "true",
      "false",
    ]);
  });

  it("follows the stored step rather than a local guess", () => {
    cardSize = "large";
    act(() => root.render(<DiscoveryCardSizeSwitch />));
    expect(segments().map((button) => button.getAttribute("aria-pressed"))).toEqual([
      "false",
      "false",
      "true",
    ]);
  });

  /** Three unlabelled letters would tell a screen reader nothing; the group carries the name the
   * settings row shows on screen. */
  it("says what the three letters are choosing between", () => {
    act(() => root.render(<DiscoveryCardSizeSwitch />));
    const group = container.querySelector("fieldset");
    expect(group?.getAttribute("aria-label")).toBe("卡片大小");
  });

  it("writes the step the reader picked", () => {
    act(() => root.render(<DiscoveryCardSizeSwitch />));
    act(() => segments()[0]?.click());
    expect(setDiscoveryCardSize).toHaveBeenCalledWith("small");
  });

  /** Pressing the step already in use is not a change; it must not write or re-render the feed. */
  it("does nothing when the step in use is pressed again", () => {
    act(() => root.render(<DiscoveryCardSizeSwitch />));
    act(() => segments()[1]?.click());
    expect(setDiscoveryCardSize).not.toHaveBeenCalled();
  });
});
