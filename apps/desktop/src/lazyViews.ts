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
import { type ComponentType, type LazyExoticComponent, lazy } from "react";

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
 */
function retryable<P extends object>(
  load: () => Promise<{ default: ComponentType<P> }>,
  replace: (next: LazyExoticComponent<ComponentType<P>>) => void,
): LazyExoticComponent<ComponentType<P>> {
  return lazy(async () => {
    try {
      return await load();
    } catch (error) {
      replace(retryable(load, replace));
      throw error;
    }
  });
}

export let ChatView = retryable(
  async () => ({ default: (await import("./components/chat/ChatView")).ChatView }),
  (next) => {
    ChatView = next;
  },
);
export let SettingsPanel = retryable(
  async () => ({ default: (await import("./components/settings/SettingsPanel")).SettingsPanel }),
  (next) => {
    SettingsPanel = next;
  },
);
export let MapView = retryable(
  async () => ({ default: (await import("./components/map/MapView")).MapView }),
  (next) => {
    MapView = next;
  },
);
export let VocabPanel = retryable(
  async () => ({ default: (await import("./components/diglot/VocabPanel")).VocabPanel }),
  (next) => {
    VocabPanel = next;
  },
);
export let DiscoveryView = retryable(
  async () => ({ default: (await import("./components/discovery/DiscoveryView")).DiscoveryView }),
  (next) => {
    DiscoveryView = next;
  },
);
export let CompanionSection = retryable(
  async () => ({
    default: (await import("./components/companion/CompanionSection")).CompanionSection,
  }),
  (next) => {
    CompanionSection = next;
  },
);
export let CompanionChatPopup = retryable(
  async () => ({
    default: (await import("./components/companion/CompanionChatPopup")).CompanionChatPopup,
  }),
  (next) => {
    CompanionChatPopup = next;
  },
);
export let OnboardingHost = retryable(
  async () => ({
    default: (await import("./components/onboarding/OnboardingHost")).OnboardingHost,
  }),
  (next) => {
    OnboardingHost = next;
  },
);
export let FocusOverlay = retryable(
  async () => ({ default: (await import("./components/focus/FocusOverlay")).FocusOverlay }),
  (next) => {
    FocusOverlay = next;
  },
);
