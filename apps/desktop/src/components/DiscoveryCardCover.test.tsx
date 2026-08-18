// @vitest-environment jsdom
/**
 * Purpose: the cover picture's deadline, mounted for real — the clock that turns a host answering
 * nothing into the card's text-forward layout has to survive the grid re-rendering around it,
 * which is the one thing that stopped it from ever firing (spec 053 T10c).
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../stores/discoveryChannelSettingsStore", () => ({
  useDiscoveryChannelSettingsStore: <Slice,>(
    select: (state: { dataSaverEnabled: boolean }) => Slice,
  ) => select({ dataSaverEnabled: false }),
}));

const { COVER_LOAD_TIMEOUT_MILLISECONDS } = await import("../lib/discoveryCoverLoad");
const { DiscoveryCardCover } = await import("./DiscoveryCardCover");

/** Stands in for the browser's own lazy-loading trigger: the element is already near the screen,
 * so observing it reports an intersection straight away, which is when the clock starts. */
class ImmediateIntersectionObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element): void {
    this.callback(
      [{ isIntersecting: true, target } as unknown as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  disconnect(): void {}
  unobserve(): void {}
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // Only the timers the deadline uses: React's own scheduler runs on real ones.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
    ImmediateIntersectionObserver;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("DiscoveryCardCover", () => {
  /**
   * FIXED (2026-08-18, spec 053 T10c). DiscoveryCardTile built the `onUnavailable` closure inline,
   * so every render handed the cover a new function, and the effect that arms the deadline listed
   * that function among its dependencies: each render disarmed the clock and started a fresh
   * eight-second one. Instrumented on a real feed, the timer was set 270 times and cleared 276
   * times over 25 seconds of sitting still, and the grey boxes the deadline exists to replace —
   * 8 to 30 of 45 tiles — never went away.
   */
  it("still gives up on a silent picture after the grid re-renders around it", () => {
    const onUnavailable = vi.fn();
    // Exactly what the grid does: a new closure on every render, wrapping the same intent.
    const draw = () =>
      act(() => {
        root.render(
          <DiscoveryCardCover
            coverUrl="https://i.ytimg.com/vi/silent/hqdefault.jpg"
            onUnavailable={() => onUnavailable()}
          />,
        );
      });

    draw();
    for (let render = 0; render < 4; render += 1) {
      act(() => {
        vi.advanceTimersByTime(1_000);
      });
      draw();
    }
    expect(onUnavailable).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(COVER_LOAD_TIMEOUT_MILLISECONDS - 4_000);
    });
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it("keeps a picture that arrives before the deadline", () => {
    const onUnavailable = vi.fn();
    act(() => {
      root.render(
        <DiscoveryCardCover
          coverUrl="https://example.org/cover.jpg"
          onUnavailable={onUnavailable}
        />,
      );
    });
    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    if (image === null) return;
    Object.defineProperty(image, "naturalWidth", { value: 1200, configurable: true });
    act(() => {
      image.dispatchEvent(new Event("load"));
    });
    act(() => {
      vi.advanceTimersByTime(COVER_LOAD_TIMEOUT_MILLISECONDS * 2);
    });
    expect(onUnavailable).not.toHaveBeenCalled();
  });
});
