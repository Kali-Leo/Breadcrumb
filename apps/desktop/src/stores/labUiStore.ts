/**
 * Purpose: tiny zustand store for the lab view's own sub-navigation (spec 017 #2) — whether
 * GoalOverlayView is covering the lab panel right now. Deliberately not part of App.tsx's
 * top-level view enum: this is a lab-internal state, not a new app view.
 * Main exports: useLabUiStore.
 */
import { create } from "zustand";

interface LabUiState {
  overlayOpen: boolean;
  openOverlay(): void;
  closeOverlay(): void;
}

export const useLabUiStore = create<LabUiState>((set) => ({
  overlayOpen: false,
  openOverlay: () => set({ overlayOpen: true }),
  closeOverlay: () => set({ overlayOpen: false }),
}));
