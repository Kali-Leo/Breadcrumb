/**
 * Purpose: the palace's two "there is nothing to look at" screens — the renderer refused to
 * start, and open sea with no land yet. Both are drawn OVER the live map instead of instead of
 * it: the Pixi container has to stay mounted for the renderer to ever get a chance to
 * initialize (bug hunt 2026-09-03 — returning early on an empty sea meant the very first visit
 * of a new learner mounted no container, useMapApplication's one-shot effect found none, and
 * the map stayed dead for the rest of the session, first island or not).
 * Main exports: MapStateOverlay, MapOverlayState.
 */
import { useTranslation } from "react-i18next";

/** null = the map speaks for itself. */
export type MapOverlayState = "loadFailed" | "emptySea" | null;

/** Which screen the palace owes the learner, if any. Pure, so the rule is testable. */
export function mapOverlayState(input: {
  initFailed: boolean;
  islandCount: number;
}): MapOverlayState {
  if (input.initFailed) return "loadFailed";
  return input.islandCount === 0 ? "emptySea" : null;
}

export function MapStateOverlay({ state }: { state: Exclude<MapOverlayState, null> }) {
  const { t } = useTranslation(["palace"]);
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-stone-50 text-stone-400">
      <span className="text-4xl">🏛️</span>
      <p className="text-sm">
        {state === "loadFailed" ? t("palace:map.loadFailed") : t("palace:map.emptySea")}
      </p>
      {state === "emptySea" && import.meta.env.DEV && (
        <p className="text-xs text-stone-300">{t("palace:map.devDemoHint")}</p>
      )}
    </div>
  );
}
