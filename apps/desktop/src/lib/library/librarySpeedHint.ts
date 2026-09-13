/**
 * Purpose: deciding whether, and what, to say when building an index is going to take a long
 * time in this particular browser.
 *
 * The fact underneath is unpleasant and real: the same book, on the same laptop, can take four
 * minutes or four hours depending on which browser is open and whether the operating system is
 * current. That is not something a reader can be expected to know, and it is not something the
 * app should let them sit through in silence.
 *
 * What it must not become is a lecture. So: no dialog, nothing that blocks, one line beside a
 * progress bar that is already there — and it only appears once the measurement says it would
 * help (SLOW_MS_PER_TEXT, which is where a book crosses from minutes into half an hour). The
 * sentence names a browser or an update, never a runtime: "WebGPU", "WebAssembly" and "threads"
 * are our problem, and a reader who is told to check their WebGPU support has been handed our
 * problem instead of an answer.
 *
 * Which sentence depends on what the device can actually do about it. An iPad cannot install
 * another browser — every browser on it is Safari — so the only real advice is to update the
 * system. Linux has no Safari and Chrome's graphics support there is the weak one, so Firefox.
 * Everywhere else, any current browser will do, and naming four of them is friendlier than
 * naming one.
 * Main exports: speedAdviceFor, SpeedAdvice.
 */
import { SLOW_MS_PER_TEXT } from "./slowThreshold";

/** The message key inside the `library` namespace, or null for "say nothing". */
export type SpeedAdvice = "speed.ipad" | "speed.linux" | "speed.desktop";

interface PlatformLike {
  userAgent: string;
  /** Present on Safari and Chromium; used only to tell an iPad from a Mac, which have shared
   * a user agent string since iPadOS 13. */
  maxTouchPoints?: number;
  platform?: string;
}

function isApplePortable(platform: PlatformLike): boolean {
  const { userAgent } = platform;
  if (/iPad|iPhone|iPod/.test(userAgent)) return true;
  // An iPad in its default mode says "Macintosh". A Mac has no touch screen; an iPad has five
  // touch points. This is Apple's own recommended test and there is no better one.
  return userAgent.includes("Macintosh") && (platform.maxTouchPoints ?? 0) > 1;
}

function isLinux(platform: PlatformLike): boolean {
  const haystack = `${platform.userAgent} ${platform.platform ?? ""}`;
  return /Linux|X11|CrOS/.test(haystack) && !haystack.includes("Android");
}

/**
 * Null means the speed is fine, or nothing has been measured yet. `msPerText` is a
 * measurement of this device doing this work, not a guess from the user agent — which is why
 * a fast machine on a slow browser is told and a slow machine on the right browser is not.
 */
export function speedAdviceFor(
  msPerText: number | null,
  platform: PlatformLike | undefined,
): SpeedAdvice | null {
  if (msPerText === null || msPerText <= SLOW_MS_PER_TEXT || platform === undefined) return null;
  if (isApplePortable(platform)) return "speed.ipad";
  if (isLinux(platform)) return "speed.linux";
  return "speed.desktop";
}
