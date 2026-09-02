/**
 * Purpose: the application shell's code-split boundaries, kept out of App.tsx so the shell
 * stays readable.
 *
 * Everything below the shell is split at its own boundary. The sidebar and the frame are the
 * only things every launch needs; a view's expensive libraries — Pixi for the palace, Recharts
 * for the trends, D3 for the comparison tree, KaTeX and Mermaid for chat markdown — used to sit
 * in the one entry chunk and be parsed before the first pixel. Now they arrive with the view
 * that uses them. The overlays are split for the same reason and, unlike the views, are also
 * mounted only when they have something to show, so their code is never fetched otherwise.
 * Each is a named export, hence the unwrap.
 *
 * Main exports: ChatView, SettingsPanel, MapView, VocabPanel, DiscoveryView, CompanionSection,
 * CompanionChatPopup, OnboardingHost, FocusOverlay.
 */
import { type ComponentProps, type ComponentType, type LazyExoticComponent, lazy } from "react";
import type { ChatView as ChatViewComponent } from "./components/chat/ChatView";
import type { CompanionChatPopup as CompanionChatPopupComponent } from "./components/companion/CompanionChatPopup";
import type { CompanionSection as CompanionSectionComponent } from "./components/companion/CompanionSection";
import type { VocabPanel as VocabPanelComponent } from "./components/diglot/VocabPanel";
import type { DiscoveryView as DiscoveryViewComponent } from "./components/discovery/DiscoveryView";
import type { FocusOverlay as FocusOverlayComponent } from "./components/focus/FocusOverlay";
import type { MapView as MapViewComponent } from "./components/map/MapView";
import type { OnboardingHost as OnboardingHostComponent } from "./components/onboarding/OnboardingHost";
import type { SettingsPanel as SettingsPanelComponent } from "./components/settings/SettingsPanel";

/**
 * React.lazy remembers a rejection for the life of the page: once a chunk fails to arrive, the
 * same error is re-thrown on every later render, so remounting the view — or resetting the
 * error boundary above it — would never go back to the network. A machine that was offline
 * when someone first opened the map would show that page blank until the app was restarted.
 *
 * So each loader replaces its own export with a fresh lazy() the moment its import fails.
 * These are `let` on purpose: an ES module export is a live binding, so App.tsx's next render
 * reads the replacement without importing anything again. LazyBoundary supplies the render —
 * it clears on the next view switch — and this supplies something new for it to try.
 *
 * One more obstacle (2026-09-02 browser walkthrough): the module map remembers a failed
 * dynamic import for the life of the document, so re-running the same `import()` never goes
 * back to the network. When the failure names the chunk's URL (Firefox and Chromium do), the
 * retry imports that URL with a fresh query string instead, which the module map treats as a
 * new module. Shared dependencies keep their plain URLs, so nothing else is duplicated.
 */
type ViewModule = Record<string, unknown>;

function chunkUrlIn(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  return /https?:\/\/[^\s"']+\.js/.exec(message)?.[0] ?? null;
}

function retryable<P>(
  load: () => Promise<ViewModule>,
  exportName: string,
  replace: (next: LazyExoticComponent<ComponentType<P>>) => void,
  failedChunkUrl: string | null = null,
): LazyExoticComponent<ComponentType<P>> {
  return lazy(async () => {
    try {
      const viewModule =
        failedChunkUrl === null
          ? await load()
          : ((await import(
              /* @vite-ignore */ `${failedChunkUrl}?retry=${Date.now()}`
            )) as ViewModule);
      const component = viewModule[exportName];
      if (typeof component !== "function" && typeof component !== "object") {
        throw new Error(`lazy view ${exportName} is not exported by its chunk`);
      }
      return { default: component as ComponentType<P> };
    } catch (error) {
      replace(retryable(load, exportName, replace, chunkUrlIn(error) ?? failedChunkUrl));
      throw error;
    }
  });
}

export let ChatView = retryable<ComponentProps<typeof ChatViewComponent>>(
  () => import("./components/chat/ChatView"),
  "ChatView",
  (next) => {
    ChatView = next;
  },
);
export let SettingsPanel = retryable<ComponentProps<typeof SettingsPanelComponent>>(
  () => import("./components/settings/SettingsPanel"),
  "SettingsPanel",
  (next) => {
    SettingsPanel = next;
  },
);
export let MapView = retryable<ComponentProps<typeof MapViewComponent>>(
  () => import("./components/map/MapView"),
  "MapView",
  (next) => {
    MapView = next;
  },
);
export let VocabPanel = retryable<ComponentProps<typeof VocabPanelComponent>>(
  () => import("./components/diglot/VocabPanel"),
  "VocabPanel",
  (next) => {
    VocabPanel = next;
  },
);
export let DiscoveryView = retryable<ComponentProps<typeof DiscoveryViewComponent>>(
  () => import("./components/discovery/DiscoveryView"),
  "DiscoveryView",
  (next) => {
    DiscoveryView = next;
  },
);
export let CompanionSection = retryable<ComponentProps<typeof CompanionSectionComponent>>(
  () => import("./components/companion/CompanionSection"),
  "CompanionSection",
  (next) => {
    CompanionSection = next;
  },
);
export let CompanionChatPopup = retryable<ComponentProps<typeof CompanionChatPopupComponent>>(
  () => import("./components/companion/CompanionChatPopup"),
  "CompanionChatPopup",
  (next) => {
    CompanionChatPopup = next;
  },
);
export let OnboardingHost = retryable<ComponentProps<typeof OnboardingHostComponent>>(
  () => import("./components/onboarding/OnboardingHost"),
  "OnboardingHost",
  (next) => {
    OnboardingHost = next;
  },
);
export let FocusOverlay = retryable<ComponentProps<typeof FocusOverlayComponent>>(
  () => import("./components/focus/FocusOverlay"),
  "FocusOverlay",
  (next) => {
    FocusOverlay = next;
  },
);
