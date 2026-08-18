// @vitest-environment jsdom
/**
 * Purpose: that a redraw's "back to the top" happens in the page and not only in the store
 * (spec 054, Leo's fifth point) — the registered element's own scroll position is the thing that
 * moves, and a page that has gone away is not reached into.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { registerDiscoveryFeedScroller, scrollDiscoveryFeedToTop } from "./discoveryFeedScroll";

let feed: HTMLDivElement;

beforeEach(() => {
  document.body.innerHTML = "";
  feed = document.createElement("div");
  document.body.append(feed);
  registerDiscoveryFeedScroller(null);
});

describe("scrollDiscoveryFeedToTop", () => {
  it("moves the registered element back to the top", () => {
    feed.scrollTop = 4200;
    registerDiscoveryFeedScroller(feed);
    scrollDiscoveryFeedToTop();
    expect(feed.scrollTop).toBe(0);
  });

  it("does nothing when the feed page is not on screen", () => {
    feed.scrollTop = 4200;
    expect(() => scrollDiscoveryFeedToTop()).not.toThrow();
    expect(feed.scrollTop).toBe(4200);
  });

  it("lets go of the element the page unregistered on its way out", () => {
    registerDiscoveryFeedScroller(feed);
    registerDiscoveryFeedScroller(null);
    feed.scrollTop = 4200;
    scrollDiscoveryFeedToTop();
    expect(feed.scrollTop).toBe(4200);
  });
});
