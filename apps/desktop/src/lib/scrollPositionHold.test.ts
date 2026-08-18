// @vitest-environment jsdom
/**
 * Purpose: the feed must come back exactly where it was. Leo, 2026-08-18: after scrolling a long
 * way down the discovery feed and opening a card, closing it must not leave him at the top.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { holdScrollPosition } from "./scrollPositionHold";

function scrollableDiv(): HTMLDivElement {
  const element = document.createElement("div");
  element.style.overflowY = "auto";
  document.body.append(element);
  return element;
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("holdScrollPosition", () => {
  it("puts the feed back where it was after a layer was open over it", () => {
    const feed = scrollableDiv();
    feed.scrollTop = 2_400;

    const release = holdScrollPosition([feed]);
    expect(feed.style.overflow).toBe("hidden");
    // Whatever ran while the layer was up — a focus move, a scroll attempt — cannot be allowed
    // to decide where the feed sits when it comes back.
    feed.scrollTop = 0;

    release();
    expect(feed.scrollTop).toBe(2_400);
    expect(feed.style.overflow).toBe("");
  });

  it("leaves an inline overflow it did not set alone", () => {
    const feed = scrollableDiv();
    feed.style.overflow = "scroll";
    const release = holdScrollPosition([feed]);
    expect(feed.style.overflow).toBe("hidden");
    release();
    expect(feed.style.overflow).toBe("scroll");
  });

  it("skips elements that are not there and holds the rest", () => {
    const feed = scrollableDiv();
    feed.scrollTop = 120;
    const release = holdScrollPosition([null, feed, undefined]);
    expect(feed.style.overflow).toBe("hidden");
    release();
    expect(feed.scrollTop).toBe(120);
  });

  it("holds the horizontal position too", () => {
    const feed = scrollableDiv();
    feed.scrollLeft = 80;
    const release = holdScrollPosition([feed]);
    feed.scrollLeft = 0;
    release();
    expect(feed.scrollLeft).toBe(80);
  });

  it("ignores a second release rather than undoing a later hold", () => {
    const feed = scrollableDiv();
    feed.scrollTop = 500;
    const release = holdScrollPosition([feed]);
    release();

    // A layer opened after the first one closed: the stale release must not touch it.
    feed.scrollTop = 900;
    const secondRelease = holdScrollPosition([feed]);
    release();
    expect(feed.style.overflow).toBe("hidden");
    secondRelease();
    expect(feed.scrollTop).toBe(900);
  });

  it("holds two layers over the same feed and ends where it started", () => {
    const feed = scrollableDiv();
    feed.scrollTop = 1_000;
    const releaseOuter = holdScrollPosition([feed]);
    const releaseInner = holdScrollPosition([feed]);
    releaseInner();
    expect(feed.scrollTop).toBe(1_000);
    releaseOuter();
    expect(feed.scrollTop).toBe(1_000);
    expect(feed.style.overflow).toBe("");
  });
});
