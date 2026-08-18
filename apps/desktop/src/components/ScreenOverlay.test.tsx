// @vitest-environment jsdom
/**
 * Purpose: the reading layer is a modal `<dialog>` in the body — the bug Leo hit on 2026-08-18 (a
 * layer opened from inside the scrolled feed landing at the top of that feed) cannot come back
 * once the browser's top layer, not our CSS, decides where the layer sits. What is checked here is
 * the handful of things this component still decides: where the dialog is mounted, that it is
 * opened and closed as a modal, the single close path, and that it does not re-add what the
 * element already carries.
 *
 * jsdom 30.0.1 gives HTMLDialogElement the `open` property and nothing else — no `showModal`, no
 * `close` (checked 2026-08-18) — so the two methods are stood in for below. Everything the browser
 * does around them is therefore NOT covered here and cannot be: the top layer, the page underneath
 * going inert, Escape closing the topmost dialog only, and `::backdrop`. Those are the browser's,
 * which is the point of the change.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScreenOverlay } from "./ScreenOverlay";

/** Enough of the two methods to see that the component opens and closes the dialog. */
function installDialogMethodStubs(): void {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    // The real one queues this; dispatching it here is what a browser's Escape ends up doing.
    this.dispatchEvent(new Event("close"));
  };
}

let appRoot: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installDialogMethodStubs();
  document.body.replaceChildren();
  document.body.removeAttribute("style");
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

function openDialogs(): HTMLDialogElement[] {
  return Array.from(document.body.querySelectorAll<HTMLDialogElement>(":scope > dialog[open]"));
}

describe("ScreenOverlay", () => {
  /**
   * FIXED (2026-08-18). The discovery reader was laid out inside the feed's own scroll container,
   * so opening a card after scrolling down put the reader far above the window. A modal dialog is
   * in the top layer, where no ancestor's overflow, transform or z-index reaches it.
   */
  it("opens as a modal dialog in the body, not inside the page it was opened from", () => {
    openOverlay();
    expect(appRoot.querySelector("dialog")).toBeNull();
    const dialogs = openDialogs();
    expect(dialogs.length).toBe(1);
    // The `open` attribute is never rendered by this component, so it can only have come from
    // showModal().
    expect(dialogs[0]?.textContent).toBe("正文");
  });

  it("names itself for a screen reader and adds nothing the element already has", () => {
    openOverlay();
    const dialog = openDialogs()[0];
    expect(dialog?.getAttribute("aria-label")).toBe("一篇文章的标题");
    // MDN warns against tabindex on a dialog, and role/aria-modal are already the element's own.
    expect(dialog?.hasAttribute("tabindex")).toBe(false);
    expect(dialog?.hasAttribute("role")).toBe(false);
    expect(dialog?.hasAttribute("aria-modal")).toBe(false);
  });

  it("closes through the dialog's own close event, which is where Escape arrives", () => {
    const onClose = vi.fn();
    openOverlay(onClose);
    act(() => openDialogs()[0]?.close());
    expect(onClose).toHaveBeenCalledTimes(1);

    // The caller owns the closing: the dialog stays mounted until it stops rendering it.
    act(() => root.render(null));
    expect(openDialogs().length).toBe(0);
  });

  it("closes the dialog when the caller stops rendering it, without calling back", () => {
    const onClose = vi.fn();
    openOverlay(onClose);
    const dialog = openDialogs()[0];
    act(() => root.render(null));
    expect(dialog?.hasAttribute("open")).toBe(false);
    // The caller took the layer away itself; telling it to close would be an answer to nothing.
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps one dialog, and the newest handler, after the caller re-renders", () => {
    const onClose = vi.fn();
    openOverlay(() => onClose());
    openOverlay(() => onClose());
    expect(openDialogs().length).toBe(1);

    act(() => openDialogs()[0]?.close());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /**
   * The drill-down: a row of the 收藏 list opens the reader over the list. Escape closing only the
   * top dialog is the browser's job (it cannot be exercised in jsdom); what is checked here is
   * that we hand it two separate modal dialogs to do it with, and that closing the upper one
   * leaves the list open underneath.
   */
  it("stacks a second dialog over the first, and closing it leaves the first open", () => {
    const closeList = vi.fn();
    const closeReader = vi.fn();
    function render(readerOpen: boolean): void {
      act(() => {
        root.render(
          <>
            <ScreenOverlay label="收藏" onClose={closeList}>
              <p>列表</p>
            </ScreenOverlay>
            {readerOpen && (
              <ScreenOverlay label="一篇文章的标题" onClose={closeReader}>
                <p>正文</p>
              </ScreenOverlay>
            )}
          </>,
        );
      });
    }

    render(true);
    expect(openDialogs().map((one) => one.getAttribute("aria-label"))).toEqual([
      "收藏",
      "一篇文章的标题",
    ]);

    render(false);
    expect(openDialogs().map((one) => one.getAttribute("aria-label"))).toEqual(["收藏"]);
    expect(closeList).not.toHaveBeenCalled();
    expect(closeReader).not.toHaveBeenCalled();
  });

  /**
   * Scrolling is stopped at the layer's edge by overscroll-behavior, not by locking the body —
   * locking it takes the scrollbar away and shifts the page underneath (Reddit's write-up of
   * their own dialog, spec 054 §a). The page also keeps its own inert bookkeeping now: the
   * browser withdraws everything outside a modal dialog.
   */
  it("leaves the page underneath untouched", () => {
    openOverlay();
    expect(openDialogs()[0]?.className).toContain("overscroll-contain");
    expect(document.body.style.overflow).toBe("");
    expect(appRoot.hasAttribute("inert")).toBe(false);
    expect(appRoot.hasAttribute("aria-hidden")).toBe(false);
    expect(appRoot.style.overflow).toBe("");
  });
});
