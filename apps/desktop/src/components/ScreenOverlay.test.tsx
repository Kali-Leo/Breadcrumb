// @vitest-environment jsdom
/**
 * Purpose: the bug Leo hit on 2026-08-18, mounted for real — a layer opened from inside a scrolled
 * page must end up in the body covering the window, never inside the page it was opened from,
 * where `absolute inset-0` resolves to the scrolled container and lands at the top of the feed.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScreenOverlay } from "./ScreenOverlay";

let appRoot: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  document.body.replaceChildren();
  appRoot = document.createElement("div");
  document.body.append(appRoot);
  root = createRoot(appRoot);
});

afterEach(() => {
  act(() => root.unmount());
  appRoot.remove();
});

function openOverlay(onClose: () => void = () => {}): void {
  act(() => {
    root.render(
      <ScreenOverlay label="一篇文章的标题" onClose={onClose}>
        <p>正文</p>
      </ScreenOverlay>,
    );
  });
}

function currentLayer(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(":scope > [role='dialog']");
}

describe("ScreenOverlay", () => {
  /**
   * FIXED (2026-08-18). The discovery reader was `absolute inset-0` inside the feed's own
   * `relative` scroll container, so it was laid out against the container's padding box: opening a
   * card after scrolling down put the reader far above the window, and closing it left the reader
   * having to scroll back up to find the card.
   */
  it("covers the window from the body, not the page it was opened from", () => {
    openOverlay();
    const layer = currentLayer();
    expect(layer).not.toBeNull();
    if (layer === null) return;
    expect(appRoot.querySelector("[role='dialog']")).toBeNull();
    expect(layer.className).toContain("fixed");
    expect(layer.className).toContain("inset-0");
    expect(layer.textContent).toBe("正文");
  });

  it("names itself for a screen reader and takes focus", () => {
    openOverlay();
    const layer = currentLayer();
    expect(layer).not.toBeNull();
    if (layer === null) return;
    expect(layer.getAttribute("aria-modal")).toBe("true");
    expect(layer.getAttribute("aria-label")).toBe("一篇文章的标题");
    expect(document.activeElement).toBe(layer);
    expect(appRoot.getAttribute("inert")).toBe("");
    expect(appRoot.getAttribute("aria-hidden")).toBe("true");
  });

  it("closes on Escape and gives the page back", () => {
    const onClose = vi.fn();
    openOverlay(onClose);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    // The caller owns the closing: the layer stays until it stops rendering it.
    act(() => root.render(null));
    expect(currentLayer()).toBeNull();
    expect(appRoot.hasAttribute("inert")).toBe(false);
    expect(appRoot.hasAttribute("aria-hidden")).toBe(false);
  });

  it("keeps answering Escape after the caller passes a new handler", () => {
    const onClose = vi.fn();
    openOverlay(() => onClose());
    openOverlay(() => onClose());
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    // A re-render must not have re-opened the layer, which would have stacked a second one.
    expect(document.body.querySelectorAll("[role='dialog']").length).toBe(1);
  });
});
