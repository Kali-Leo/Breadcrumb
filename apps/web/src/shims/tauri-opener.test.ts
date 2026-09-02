/**
 * Purpose: the protocol allowlist is a security boundary — the links it opens come from search
 * results and from model output — and it had no test. The desktop capability set restricts this
 * to http and https; this build has to make the same promise, whichever one you happen to run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openUrl } from "./tauri-opener";

const open = vi.fn();
const original = globalThis.open;

beforeEach(() => {
  open.mockClear();
  globalThis.open = open as unknown as typeof globalThis.open;
});
afterEach(() => {
  globalThis.open = original;
});

describe("opening a link from outside the app", () => {
  it.each(["https://example.com/a", "http://example.com/a"])("opens %s", async (url) => {
    await openUrl(url);
    // noopener/noreferrer: the opened page must not get a handle back to this one.
    expect(open).toHaveBeenCalledWith(url, "_blank", "noopener,noreferrer");
  });

  it.each([
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox",
    "tauri://localhost/",
    "not a url at all",
  ])("refuses %s", async (url) => {
    await openUrl(url);
    expect(open).not.toHaveBeenCalled();
  });
});
