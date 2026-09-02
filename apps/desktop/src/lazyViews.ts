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
import { lazy } from "react";

export const ChatView = lazy(async () => ({
  default: (await import("./components/chat/ChatView")).ChatView,
}));
export const SettingsPanel = lazy(async () => ({
  default: (await import("./components/settings/SettingsPanel")).SettingsPanel,
}));
export const MapView = lazy(async () => ({
  default: (await import("./components/map/MapView")).MapView,
}));
export const VocabPanel = lazy(async () => ({
  default: (await import("./components/diglot/VocabPanel")).VocabPanel,
}));
export const DiscoveryView = lazy(async () => ({
  default: (await import("./components/discovery/DiscoveryView")).DiscoveryView,
}));
export const CompanionSection = lazy(async () => ({
  default: (await import("./components/companion/CompanionSection")).CompanionSection,
}));
export const CompanionChatPopup = lazy(async () => ({
  default: (await import("./components/companion/CompanionChatPopup")).CompanionChatPopup,
}));
export const OnboardingHost = lazy(async () => ({
  default: (await import("./components/onboarding/OnboardingHost")).OnboardingHost,
}));
export const FocusOverlay = lazy(async () => ({
  default: (await import("./components/focus/FocusOverlay")).FocusOverlay,
}));
