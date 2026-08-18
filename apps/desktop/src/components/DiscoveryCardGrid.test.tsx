// @vitest-environment jsdom
/**
 * Purpose: the grid the cards are laid into (spec 054 §(b)). The arithmetic is checked in
 * lib/discoveryFeedGrid.test; what is checked here is that the grid on screen is actually built
 * from those numbers, because the bug being fixed was a breakpoint ladder that looked reasonable
 * in the markup and drew 613px cards on a wide monitor.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../stores/discoveryStore", () => ({
  useDiscoveryStore: { getState: () => ({ loadMore: vi.fn(), recordImpression: vi.fn() }) },
}));

vi.mock("../stores/discoveryChannelSettingsStore", () => ({
  useDiscoveryChannelSettingsStore: <Slice,>(
    select: (state: { dataSaverEnabled: boolean }) => Slice,
  ) => select({ dataSaverEnabled: false }),
}));

const { DiscoveryCardGrid } = await import("./DiscoveryCardGrid");
const { DiscoveryFeedSectionHeading } = await import("./DiscoveryFeedSectionHeading");

class SilentIntersectionObserver {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
    SilentIntersectionObserver;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const cards: DiscoveryCardRow[] = [];

function grid(): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-testid="discovery-card-grid"]');
}

describe("DiscoveryCardGrid", () => {
  it("lays cards into as many 320px columns as fit, 20px apart, capped at 1680px", () => {
    act(() =>
      root.render(<DiscoveryCardGrid cards={cards} loading={false} onOpen={() => undefined} />),
    );
    const style = grid()?.getAttribute("style") ?? "";
    expect(style).toContain("repeat(auto-fill, minmax(320px, 1fr))");
    expect(style).toContain("gap: 20px");
    expect(style).toContain("max-width: 1680px");
  });

  /** auto-fit would collapse the empty tracks and stretch the last row's cards across them. */
  it("never uses auto-fit", () => {
    act(() =>
      root.render(<DiscoveryCardGrid cards={cards} loading={false} onOpen={() => undefined} />),
    );
    expect(grid()?.getAttribute("style") ?? "").not.toContain("auto-fit");
  });

  it("centres itself once it stops widening", () => {
    act(() =>
      root.render(<DiscoveryCardGrid cards={cards} loading={false} onOpen={() => undefined} />),
    );
    expect(grid()?.className).toContain("mx-auto");
  });

  /** A loading grid has to be the shape the cards will be, or the page jumps under the reader's
   * eyes when the batch lands. */
  it("shapes its loading placeholders like real cards", () => {
    act(() =>
      root.render(<DiscoveryCardGrid cards={cards} loading={true} onOpen={() => undefined} />),
    );
    expect(grid()?.querySelectorAll(".pt-\\[56\\.25\\%\\]").length).toBeGreaterThan(0);
  });
});

describe("DiscoveryFeedSectionHeading", () => {
  /** Built, not yet placed in the feed: what the sections are is a question about the feed's
   * ordering, not its layout. */
  it("runs the full width of the grid with nothing drawn around it", () => {
    act(() => root.render(<DiscoveryFeedSectionHeading>刚发布的</DiscoveryFeedSectionHeading>));
    const heading = container.querySelector("h2");
    expect(heading?.textContent).toBe("刚发布的");
    expect(heading?.className).toContain("col-span-full");
    for (const drawn of ["border", "shadow", "bg-", "divide"]) {
      expect(heading?.className).not.toContain(drawn);
    }
  });
});
