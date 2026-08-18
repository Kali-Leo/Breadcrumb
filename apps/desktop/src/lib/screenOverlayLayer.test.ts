// @vitest-environment jsdom
/**
 * Purpose: the stack rules a second layer breaks if nobody owns them — Escape reaching only the
 * top layer (the reader opened from the 收藏 list used to close the list under itself, because
 * both listened to the document directly), the page underneath staying out of reach for keyboard
 * and screen reader, and focus going back to the thing that opened the layer.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openScreenOverlayLayer, openScreenOverlayLayerCount } from "./screenOverlayLayer";

function appendToBody(tag: "div" | "button"): HTMLElement {
  const element = document.createElement(tag);
  document.body.append(element);
  return element;
}

function pressEscape(target: EventTarget = document): void {
  // cancelable, like the real key event, so a layer below can claim it with preventDefault.
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
  );
}

beforeEach(() => {
  document.body.replaceChildren();
  expect(openScreenOverlayLayerCount()).toBe(0);
});

describe("openScreenOverlayLayer", () => {
  it("takes the page underneath out of reach and gives it back on close", () => {
    const appRoot = appendToBody("div");
    const layer = appendToBody("div");

    const close = openScreenOverlayLayer({ element: layer, onRequestClose: () => {} });
    expect(appRoot.getAttribute("inert")).toBe("");
    expect(appRoot.getAttribute("aria-hidden")).toBe("true");
    expect(layer.hasAttribute("inert")).toBe(false);

    close();
    expect(appRoot.hasAttribute("inert")).toBe(false);
    expect(appRoot.hasAttribute("aria-hidden")).toBe(false);
  });

  it("closes the top layer only, and leaves the one underneath open", () => {
    const appRoot = appendToBody("div");
    const list = appendToBody("div");
    const reader = appendToBody("div");
    const closeList = vi.fn();
    const closeReader = vi.fn();

    const releaseList = openScreenOverlayLayer({ element: list, onRequestClose: closeList });
    const releaseReader = openScreenOverlayLayer({ element: reader, onRequestClose: closeReader });

    pressEscape();
    expect(closeReader).toHaveBeenCalledTimes(1);
    expect(closeList).not.toHaveBeenCalled();

    // The reader is gone; the list is still up, so the page behind stays out of reach.
    releaseReader();
    expect(list.hasAttribute("inert")).toBe(false);
    expect(appRoot.getAttribute("inert")).toBe("");

    pressEscape();
    expect(closeList).toHaveBeenCalledTimes(1);
    releaseList();
    expect(appRoot.hasAttribute("inert")).toBe(false);
  });

  it("stops listening once the last layer closes", () => {
    const layer = appendToBody("div");
    const onRequestClose = vi.fn();
    const close = openScreenOverlayLayer({ element: layer, onRequestClose });
    close();
    pressEscape();
    expect(onRequestClose).not.toHaveBeenCalled();
    expect(openScreenOverlayLayerCount()).toBe(0);
  });

  it("leaves Escape alone when a layer below already claimed the key", () => {
    const layer = appendToBody("div");
    const onRequestClose = vi.fn();
    const close = openScreenOverlayLayer({ element: layer, onRequestClose });

    const inner = document.createElement("input");
    layer.append(inner);
    inner.addEventListener("keydown", (event) => event.preventDefault());
    pressEscape(inner);

    expect(onRequestClose).not.toHaveBeenCalled();
    close();
  });

  it("moves focus into the layer and back to the card that opened it", () => {
    const trigger = appendToBody("button");
    trigger.focus();
    const layer = appendToBody("div");
    layer.tabIndex = -1;

    const close = openScreenOverlayLayer({ element: layer, onRequestClose: () => {} });
    expect(document.activeElement).toBe(layer);

    close();
    expect(document.activeElement).toBe(trigger);
  });

  it("does not chase a trigger that left the page while the layer was open", () => {
    const trigger = appendToBody("button");
    trigger.focus();
    const layer = appendToBody("div");
    layer.tabIndex = -1;
    const close = openScreenOverlayLayer({ element: layer, onRequestClose: () => {} });

    // The feed re-rendered underneath and the card is gone: nothing to hand focus back to.
    trigger.remove();
    expect(() => close()).not.toThrow();
  });

  it("ignores a second close", () => {
    const layer = appendToBody("div");
    const close = openScreenOverlayLayer({ element: layer, onRequestClose: () => {} });
    close();
    close();
    expect(openScreenOverlayLayerCount()).toBe(0);
  });
});
