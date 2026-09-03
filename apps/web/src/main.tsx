/**
 * Purpose: entry point of the browser edition. It mounts the desktop application's own root
 * component — the two builds share every line of feature code; only the aliased modules
 * differ (see vite.config.ts).
 *
 * The one thing this entry adds is a warning when the browser cannot give us durable storage,
 * because that is the single way this edition can quietly disappoint someone: everything works
 * perfectly, and then the tab closes and the work is gone.
 * Main exports: none (side effects only).
 */

import App from "@desktop/App";
import { initI18n } from "@desktop/i18n";
import { applyInputMode } from "@desktop/lib/platform/inputMode";
import i18next from "i18next";
import React from "react";
import ReactDOM from "react-dom/client";
import { openBrowserDatabase, requestPersistentStorage, storageBlocker } from "./shims/sqlite";
import "@desktop/App.css";

// Clickjacking guard. `frame-ancestors` is the right answer and we cannot give it: the CSP is
// delivered as a <meta> tag (see index.html) because GitHub Pages sets no response headers, and
// browsers ignore frame-ancestors in meta policies. So the page checks for itself. It matters
// because the irreversible actions here — removing a language pack, clearing data, the API key
// field — are exactly what a transparent overlay would aim someone at.
if (globalThis.self !== globalThis.top) {
  document.documentElement.textContent = "";
  throw new Error("Breadcrumb refuses to run inside a frame");
}

/** Kept for the case the worker could not name: a fallback that says the one thing that is
 * certainly true, in both of the languages someone arriving cold is most likely to read. */
const UNKNOWN_CAUSE =
  "这个浏览器不允许本页保存数据，关掉标签页后这次的内容不会留下。换一个浏览器窗口" +
  "（非无痕模式）就可以正常保存。 · This browser will not let the page store data, so " +
  "nothing from this session will be kept. A normal (non-private) window will save it.";

function bannerText(): string | null {
  switch (storageBlocker()) {
    case null:
      // On disk. Whether the browser also promised not to evict it later changes nothing a
      // learner can act on right now, so it stays out of the way (see requestPersistentStorage).
      return null;
    case "unsupported":
      return i18next.t("state.storageUnsupported", { ns: "common" });
    case "blocked":
      return i18next.t("state.storageBlocked", { ns: "common" });
    case "otherTab":
      return i18next.t("state.storageOtherTab", { ns: "common" });
    default:
      return UNKNOWN_CAUSE;
  }
}

const LANGUAGE_GRACE_MS = 1500;
function languageSettled(): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, LANGUAGE_GRACE_MS);
    function done(): void {
      clearTimeout(timer);
      i18next.off("languageChanged", done);
      resolve();
    }
    i18next.on("languageChanged", done);
  });
}

function warnIfNotPersistent(): void {
  const text = bannerText();
  if (text === null) return;
  const banner = document.createElement("div");
  // Top padding grows by the safe area: installed to a home screen, the status bar would
  // otherwise sit on the first line.
  banner.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:99999;background:#fef3c7;color:#78350f;" +
    "padding:8px 14px;padding-top:calc(8px + env(safe-area-inset-top));" +
    "font-size:13px;text-align:center;font-family:system-ui,sans-serif";
  banner.textContent = text;
  document.body.appendChild(banner);
}

// Finger or pointer is decided before the first paint, so nothing renders for the wrong one.
applyInputMode();

void (async () => {
  // Not awaited: Firefox answers persist() with a permission prompt, and a page that waits
  // for that answer before it draws anything is a blank page until the prompt is dealt with
  // (found in the 2026-09-02 headless walkthrough). The grant applies to the origin, so asking
  // while the database opens still covers the files it creates.
  void requestPersistentStorage();
  // Opening the database first means the persistence question is answered before the first
  // paint, rather than a banner appearing under someone who has already started typing.
  await openBrowserDatabase();
  await initI18n();
  // The interface language is chosen by the settings store once the app mounts, so a banner
  // drawn now would always speak the source language. Wait for that first switch (or a short
  // grace period when there is none) before picking the sentence.
  void languageSettled().then(warnIfNotPersistent);
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
})();
