import React from "react";
import ReactDOM from "react-dom/client";

// Dev black box: a crash must never be a silent white screen.
//
// Development only, and the whole block rather than just the box: mirroring every
// console.warn/error onto a permanent red overlay prints raw sqlx errors, internal ids and
// request URLs to whoever is looking at the screen. Vite evaluates import.meta.env.DEV at
// build time, so a production bundle drops all of this.
if (import.meta.env.DEV) {
  const showFatal = (message: string) => {
    let box = document.getElementById("fatal-error-box");
    if (!box) {
      box = document.createElement("pre");
      box.id = "fatal-error-box";
      box.style.cssText =
        "position:fixed;inset:auto 8px 8px 8px;max-height:45vh;overflow:auto;background:#7f1d1d;color:#fff;padding:10px;font-size:12px;z-index:99999;white-space:pre-wrap;border-radius:8px";
      box.title = "Click to dismiss";
      box.addEventListener("click", () => box?.remove());
      document.body.appendChild(box);
    }
    box.textContent += `${message}\n`;
  };
  // Mirror console problems too — my eyes read the screen, not the devtools.
  for (const level of ["error", "warn"] as const) {
    const original = console[level].bind(console);
    console[level] = (...parts: unknown[]) => {
      original(...parts);
      showFatal(
        `[${level}] ${parts.map((part) => (part instanceof Error ? part.stack : String(part))).join(" ")}`,
      );
    };
  }
  window.addEventListener("error", (event) =>
    showFatal(`${event.message}\n${event.error?.stack ?? ""}`),
  );
  window.addEventListener("unhandledrejection", (event) => {
    // JavaScriptCore stacks omit the message line — print both explicitly.
    const reason: unknown = event.reason;
    const message = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason);
    const stack = reason instanceof Error ? (reason.stack ?? "") : "";
    showFatal(`Unhandled: ${message}\n${stack}`);
  });
}

import App from "./App";
import { initI18n } from "./i18n";
import { applyInputMode } from "./lib/platform/inputMode";

// Finger or pointer is decided before the first paint, so nothing renders for the wrong one.
applyInputMode();

// Messages must be loaded before the first render, or the first paint is raw keys.
void initI18n().then(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
