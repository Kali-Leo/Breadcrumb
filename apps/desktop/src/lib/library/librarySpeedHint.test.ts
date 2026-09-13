/**
 * Purpose: the sentence a reader gets when their browser is the slow part — that it appears
 * only when the measurement says it would help, that it is the right advice for the device
 * they are actually on, and that it never leaks our vocabulary into their screen.
 */
import { describe, expect, it } from "vitest";
import { speedAdviceFor } from "./librarySpeedHint";
import { SLOW_MS_PER_TEXT } from "./slowThreshold";

const IPAD_MODERN = {
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.0 Safari/605.1.15",
  maxTouchPoints: 5,
};
const IPHONE = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1" };
const MAC = {
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.0 Safari/605.1.15",
  maxTouchPoints: 0,
};
const LINUX = {
  userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0.0.0 Safari/537.36",
  platform: "Linux x86_64",
};
const WINDOWS = { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0" };

const slow = SLOW_MS_PER_TEXT + 50;

describe("speedAdviceFor", () => {
  it("says nothing until something has actually been measured", () => {
    expect(speedAdviceFor(null, LINUX)).toBe(null);
  });

  it("says nothing when the speed is fine, however humble the device", () => {
    expect(speedAdviceFor(SLOW_MS_PER_TEXT, LINUX)).toBe(null);
    expect(speedAdviceFor(12, IPAD_MODERN)).toBe(null);
  });

  it("tells an iPad to update, because an iPad cannot change browser engine", () => {
    expect(speedAdviceFor(slow, IPAD_MODERN)).toBe("speed.ipad");
    expect(speedAdviceFor(slow, IPHONE)).toBe("speed.ipad");
  });

  it("tells a Mac to change browser, and does not mistake it for an iPad", () => {
    // The two have shared a user agent string since iPadOS 13; only the touch screen differs.
    expect(speedAdviceFor(slow, MAC)).toBe("speed.desktop");
  });

  it("tells Linux to use Firefox specifically", () => {
    expect(speedAdviceFor(slow, LINUX)).toBe("speed.linux");
  });

  it("names several browsers everywhere else", () => {
    expect(speedAdviceFor(slow, WINDOWS)).toBe("speed.desktop");
  });

  it("says nothing where there is no device to advise about", () => {
    expect(speedAdviceFor(slow, undefined)).toBe(null);
  });
});
